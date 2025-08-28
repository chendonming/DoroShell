import { Client } from 'basic-ftp'
import * as path from 'path'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import type {
  FTPCredentials,
  FileItem,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  TransferProgress
} from '../types'

export class FTPService extends EventEmitter {
  private client: Client | null = null
  private isConnected = false
  private currentCredentials: FTPCredentials | null = null
  private currentRemotePath = '/'
  private operationQueue: Promise<unknown> = Promise.resolve()

  constructor() {
    super()
  }

  // 确保FTP操作按顺序执行
  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const currentOperation = this.operationQueue.then(operation).catch((error) => {
      console.error('FTP operation failed:', error)
      throw error
    })

    this.operationQueue = currentOperation.catch(() => {}) // 防止队列被错误中断

    return currentOperation
  }

  async connect(credentials: FTPCredentials): Promise<FTPConnectionResult> {
    try {
      if (this.client) {
        this.client.close()
      }

      this.client = new Client()
      this.client.ftp.verbose = true

      await this.client.access({
        host: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        secure: credentials.protocol === 'sftp'
      })

      this.isConnected = true
      this.currentCredentials = credentials
      this.currentRemotePath = '/'

      return {
        success: true,
        message: `Successfully connected to ${credentials.host}`
      }
    } catch (error) {
      console.error('Connection failed:', error)
      this.isConnected = false
      this.currentCredentials = null

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.close()
      this.client = null
    }
    this.isConnected = false
    this.currentCredentials = null
    this.currentRemotePath = '/'
  }

  async listDirectory(remotePath?: string): Promise<DirectoryListResult> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          files: [],
          currentPath: '',
          error: 'Not connected to FTP server'
        }
      }

      try {
        // 只有当指定了不同的路径时才切换目录
        if (remotePath && remotePath !== this.currentRemotePath) {
          await this.client.cd(remotePath)
          this.currentRemotePath = remotePath
        }

        const list = await this.client.list()

        const files: FileItem[] = list.map((item) => ({
          name: item.name,
          type: item.isDirectory ? 'directory' : 'file',
          size: item.size,
          modified: item.modifiedAt ? item.modifiedAt.toISOString() : '',
          permissions: item.permissions?.toString(),
          path: path.posix.join(this.currentRemotePath, item.name)
        }))

        return {
          success: true,
          files,
          currentPath: this.currentRemotePath
        }
      } catch (error) {
        console.error('Failed to list directory:', error)
        return {
          success: false,
          files: [],
          currentPath: this.currentRemotePath,
          error: error instanceof Error ? error.message : 'Failed to list directory'
        }
      }
    })
  }

  async changeDirectory(remotePath: string): Promise<DirectoryListResult> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          files: [],
          currentPath: '',
          error: 'Not connected to FTP server'
        }
      }

      try {
        // 直接切换目录并获取列表，避免重复调用
        await this.client.cd(remotePath)
        this.currentRemotePath = remotePath

        const list = await this.client.list()

        const files: FileItem[] = list.map((item) => ({
          name: item.name,
          type: item.isDirectory ? 'directory' : 'file',
          size: item.size,
          modified: item.modifiedAt ? item.modifiedAt.toISOString() : '',
          permissions: item.permissions?.toString(),
          path: path.posix.join(this.currentRemotePath, item.name)
        }))

        return {
          success: true,
          files,
          currentPath: this.currentRemotePath
        }
      } catch (error) {
        console.error('Failed to change directory:', error)
        return {
          success: false,
          files: [],
          currentPath: this.currentRemotePath,
          error: error instanceof Error ? error.message : 'Failed to change directory'
        }
      }
    })
  }

  async uploadFile(localPath: string, remotePath: string): Promise<TransferResult> {
    const transferId = Math.random().toString(36).substr(2, 9)

    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          transferId,
          error: 'Not connected to FTP server'
        }
      }

      try {
        // 检查本地文件是否存在
        if (!fs.existsSync(localPath)) {
          return {
            success: false,
            transferId,
            error: 'Local file does not exist'
          }
        }

        const stats = fs.statSync(localPath)
        let uploadedBytes = 0

        // 发送初始进度
        this.emit('transferProgress', {
          transferId,
          progress: 0,
          status: 'uploading'
        } as TransferProgress)

        // 设置进度追踪
        this.client.trackProgress((info) => {
          uploadedBytes += info.bytes
          const progress = Math.round((uploadedBytes / stats.size) * 100)

          this.emit('transferProgress', {
            transferId,
            progress: Math.min(progress, 100),
            status: 'uploading'
          } as TransferProgress)
        })

        await this.client.uploadFrom(localPath, remotePath)

        // 清除进度追踪
        this.client.trackProgress()

        // 发送完成状态
        this.emit('transferProgress', {
          transferId,
          progress: 100,
          status: 'completed'
        } as TransferProgress)

        return {
          success: true,
          transferId
        }
      } catch (error) {
        console.error('Upload failed:', error)

        // 清除进度追踪
        if (this.client) {
          this.client.trackProgress()
        }

        const errorMessage = error instanceof Error ? error.message : 'Upload failed'

        this.emit('transferProgress', {
          transferId,
          progress: 0,
          status: 'failed',
          error: errorMessage
        } as TransferProgress)

        return {
          success: false,
          transferId,
          error: errorMessage
        }
      }
    })
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    transferId?: string
  ): Promise<TransferResult> {
    const finalTransferId = transferId || Math.random().toString(36).substr(2, 9)

    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          transferId: finalTransferId,
          error: 'Not connected to FTP server'
        }
      }

      try {
        // 发送初始进度
        this.emit('transferProgress', {
          transferId: finalTransferId,
          progress: 0,
          status: 'downloading'
        } as TransferProgress)

        // 设置进度追踪
        this.client.trackProgress((info) => {
          // 下载进度处理
          this.emit('transferProgress', {
            transferId: finalTransferId,
            progress: Math.min(Math.round((info.bytes / (info.bytes + 1000)) * 100), 90),
            status: 'downloading'
          } as TransferProgress)
        })

        await this.client.downloadTo(localPath, remotePath)

        // 清除进度追踪
        this.client.trackProgress()

        // 发送完成状态
        this.emit('transferProgress', {
          transferId: finalTransferId,
          progress: 100,
          status: 'completed'
        } as TransferProgress)

        return {
          success: true,
          transferId: finalTransferId
        }
      } catch (error) {
        console.error('Download failed:', error)

        // 清除进度追踪
        if (this.client) {
          this.client.trackProgress()
        }

        const errorMessage = error instanceof Error ? error.message : 'Download failed'

        this.emit('transferProgress', {
          transferId: finalTransferId,
          progress: 0,
          status: 'failed',
          error: errorMessage
        } as TransferProgress)

        return {
          success: false,
          transferId: finalTransferId,
          error: errorMessage
        }
      }
    })
  }

  getCurrentPath(): string {
    return this.currentRemotePath
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  getCurrentCredentials(): FTPCredentials | null {
    return this.currentCredentials
  }
}
