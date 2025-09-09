import SftpClient from 'ssh2-sftp-client'
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

export class SFTPService extends EventEmitter {
  private client: SftpClient | null = null
  private isConnected = false
  private currentCredentials: FTPCredentials | null = null
  private currentRemotePath = '/'
  private operationQueue: Promise<unknown> = Promise.resolve()

  constructor() {
    super()
  }

  // 确保SFTP操作按顺序执行
  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const currentOperation = this.operationQueue.then(operation).catch((error) => {
      console.error('SFTP operation failed:', error)
      throw error
    })

    this.operationQueue = currentOperation.catch(() => {}) // 防止队列被错误中断

    return currentOperation
  }

  async connect(credentials: FTPCredentials): Promise<FTPConnectionResult> {
    try {
      if (this.client) {
        await this.client.end()
      }

      this.client = new SftpClient()

      try {
        // forward underlying errors
        const emitterLike = this.client as unknown as {
          on?: (ev: string, cb: (...args: unknown[]) => void) => void
        }
        if (emitterLike && typeof emitterLike.on === 'function') {
          emitterLike.on('error', (...args: unknown[]) => {
            try {
              const e = (args && args[0]) as Error
              this.emit('error', e)
            } catch {
              /* ignore */
            }
          })
        }
      } catch {
        /* ignore */
      }

      await this.client.connect({
        host: credentials.host,
        port: credentials.port,
        username: credentials.username,
        password: credentials.password,
        readyTimeout: 20000,
        retries: 1
      })

      this.isConnected = true
      this.currentCredentials = credentials

      // 直接设置默认工作目录为根目录
      // 避免使用可能不被支持的 cwd() 或 realPath 操作
      this.currentRemotePath = '/'

      return {
        success: true,
        message: `已成功连接到 SFTP 服务器 ${credentials.host}:${credentials.port}`
      }
    } catch (error) {
      this.isConnected = false
      this.currentCredentials = null
      const errorMessage = error instanceof Error ? error.message : '未知错误'

      return {
        success: false,
        error: `SFTP 连接失败: ${errorMessage}`
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        try {
          await this.client.end()
        } catch (err) {
          // Ignore common network reset errors
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('ECONNRESET')) {
            // expected on some servers, do not log as error
            console.warn('SFTP disconnect ECONNRESET ignored')
          } else {
            console.error('SFTP client end error:', err)
          }
        }
        this.client = null
      }
      this.isConnected = false
      this.currentCredentials = null
      this.currentRemotePath = '/'
    } catch (error) {
      console.error('SFTP断开连接时出错:', error)
    }
  }

  async listDirectory(remotePath?: string): Promise<DirectoryListResult> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          files: [],
          currentPath: this.currentRemotePath || '/',
          error: '未连接到SFTP服务器'
        }
      }

      // 确定目标路径
      let targetPath = remotePath || this.currentRemotePath || '/'

      // 标准化路径，确保使用正斜杠
      targetPath = targetPath.replace(/\\/g, '/')

      // 如果路径不以 / 开头，添加它
      if (!targetPath.startsWith('/')) {
        targetPath = '/' + targetPath
      }

      try {
        const list = await this.client.list(targetPath)
        const files: FileItem[] = list
          .filter((item) => {
            // 过滤掉 . 和 .. 目录
            return item.name !== '.' && item.name !== '..'
          })
          .map((item) => {
            // 解析文件大小
            const size =
              typeof item.size === 'number' ? item.size : parseInt(item.size as string, 10) || 0

            // 解析修改时间
            let modified: string
            if (item.modifyTime) {
              modified = new Date(item.modifyTime).toISOString()
            } else {
              modified = new Date().toISOString()
            }

            return {
              name: item.name,
              type: item.type === 'd' ? 'directory' : 'file',
              size,
              modified,
              permissions:
                item.rights?.user + item.rights?.group + item.rights?.other || 'rwxr-xr-x',
              path: path.posix.join(targetPath, item.name)
            }
          })

        console.log(`SFTP: 过滤后得到 ${files.length} 个有效项目`)

        // 更新当前路径
        this.currentRemotePath = targetPath

        return {
          success: true,
          files,
          currentPath: targetPath
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'

        // 不再自动回退到根目录，直接返回失败结果
        // 这样前端可以正确判断目录不存在的情况
        console.log(`[SFTPService] Directory '${targetPath}' not accessible: ${errorMessage}`)
        
        return {
          success: false,
          files: [],
          currentPath: this.currentRemotePath || '/',
          error: `无法访问目录: ${errorMessage}`
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
          currentPath: this.currentRemotePath || '/',
          error: '未连接到SFTP服务器'
        }
      }

      try {
        // 标准化路径
        let targetPath = remotePath.replace(/\\/g, '/')

        // 如果路径不以 / 开头，添加它
        if (!targetPath.startsWith('/')) {
          targetPath = '/' + targetPath
        }

        // 尝试切换到目录并列出内容
        const list = await this.client.list(targetPath)

        // 如果成功，更新当前路径
        this.currentRemotePath = targetPath

        const files: FileItem[] = list.map((item) => {
          const size =
            typeof item.size === 'number' ? item.size : parseInt(item.size as string, 10) || 0

          let modified: string
          if (item.modifyTime) {
            modified = new Date(item.modifyTime).toISOString()
          } else {
            modified = new Date().toISOString()
          }

          return {
            name: item.name,
            type: item.type === 'd' ? 'directory' : 'file',
            size,
            modified,
            permissions: item.rights?.user + item.rights?.group + item.rights?.other || 'rwxr-xr-x',
            path: path.posix.join(targetPath, item.name)
          }
        })

        return {
          success: true,
          files,
          currentPath: targetPath
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        return {
          success: false,
          files: [],
          currentPath: this.currentRemotePath || '/',
          error: `切换目录失败: ${errorMessage}`
        }
      }
    })
  }

  async uploadFile(localPath: string, remotePath: string): Promise<TransferResult> {
    const transferId = `sftp_upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          transferId,
          error: '未连接到SFTP服务器'
        }
      }

      console.log('[SFTPService] uploadFile called ->', { transferId, localPath, remotePath })

      if (!fs.existsSync(localPath)) {
        console.warn('[SFTPService] uploadFile local file not found ->', localPath)
        return {
          success: false,
          transferId,
          error: '本地文件不存在'
        }
      }

      const localStats = fs.statSync(localPath)

      // 确保远程目录存在
      const remoteDir = path.posix.dirname(remotePath)
      if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
        console.log('[SFTPService] Ensuring remote directory exists:', remoteDir)
        try {
          await this.client.mkdir(remoteDir, true)
        } catch (mkdirError) {
          console.error('[SFTPService] Failed to create remote directory:', mkdirError)
          const errorMessage =
            mkdirError instanceof Error ? mkdirError.message : 'Failed to create directory'
          return {
            success: false,
            transferId,
            error: `无法创建远程目录 ${remoteDir}: ${errorMessage}`
          }
        }
      }

      try {
        // 创建上传进度回调
        const progressCallback = (total: number, uploaded: number): void => {
          const progress = Math.round((uploaded / total) * 100)
          // 记录进度
          console.log('[SFTPService] upload progress ->', { transferId, uploaded, total, progress })

          this.emit('transferProgress', {
            transferId,
            progress,
            status: 'uploading' as const
          } as TransferProgress)
        }

        await this.client.fastPut(localPath, remotePath, {
          step: (total, uploaded) => progressCallback(total, uploaded)
        })

        // 发送完成进度
        console.log('[SFTPService] uploadFile success ->', { transferId, localPath, remotePath })

        // 上传后尝试校验远程文件大小
        let verified = false
        try {
          // ssh2-sftp-client 提供 stat 方法
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const remoteStat = await this.client.stat(remotePath)
          const remoteSize = (remoteStat && (remoteStat.size ?? remoteStat.attrs?.size)) || 0
          console.log(
            '[SFTPService] upload verify stat -> transferId=%s remoteSize=%s expected=%s',
            transferId,
            remoteSize,
            localStats.size
          )
          if (typeof remoteSize === 'number') {
            verified = remoteSize === localStats.size
          }
        } catch (verifyErr) {
          console.warn(
            '[SFTPService] upload verify stat failed -> transferId=%s remotePath=%s error=%o',
            transferId,
            remotePath,
            verifyErr
          )
        }

        console.log(
          '[SFTPService] uploadFile completed -> transferId=%s localPath=%s remotePath=%s verified=%s',
          transferId,
          localPath,
          remotePath,
          verified
        )

        if (!verified) {
          const msg = `Upload reported success but verification failed for ${remotePath}`
          this.emit('transferProgress', {
            transferId,
            progress: 0,
            status: 'failed' as const,
            error: msg
          } as TransferProgress)

          return {
            success: false,
            transferId,
            error: msg
          }
        }

        this.emit('transferProgress', {
          transferId,
          progress: 100,
          status: 'completed' as const
        } as TransferProgress)

        return {
          success: true,
          transferId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'

        this.emit('transferProgress', {
          transferId,
          progress: 0,
          status: 'failed' as const,
          error: errorMessage
        } as TransferProgress)

        return {
          success: false,
          transferId,
          error: `上传失败: ${errorMessage}`
        }
      }
    })
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    transferId?: string
  ): Promise<TransferResult> {
    const id =
      transferId || `sftp_download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return {
          success: false,
          transferId: id,
          error: '未连接到SFTP服务器'
        }
      }

      try {
        // 确保本地目录存在
        const localDir = path.dirname(localPath)
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true })
        }

        // 创建下载进度回调
        const progressCallback = (total: number, downloaded: number): void => {
          const progress = Math.round((downloaded / total) * 100)
          this.emit('transferProgress', {
            transferId: id,
            progress,
            status: 'downloading' as const
          } as TransferProgress)
        }

        await this.client.fastGet(remotePath, localPath, {
          step: (total, downloaded) => progressCallback(total, downloaded)
        })

        // 发送完成进度
        this.emit('transferProgress', {
          transferId: id,
          progress: 100,
          status: 'completed' as const
        } as TransferProgress)

        return {
          success: true,
          transferId: id
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'

        this.emit('transferProgress', {
          transferId: id,
          progress: 0,
          status: 'failed' as const,
          error: errorMessage
        } as TransferProgress)

        return {
          success: false,
          transferId: id,
          error: `下载失败: ${errorMessage}`
        }
      }
    })
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  getCurrentCredentials(): FTPCredentials | null {
    return this.currentCredentials
  }

  getCurrentPath(): string {
    return this.currentRemotePath
  }

  async createDirectory(remotePath: string): Promise<{ success: boolean; error?: string }> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return { success: false, error: 'Not connected to SFTP server' }
      }
      try {
        await this.client.mkdir(remotePath, true)
        return { success: true }
      } catch (error) {
        console.error('SFTP createDirectory failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Create directory failed'
        }
      }
    })
  }

  async deleteFile(remotePath: string): Promise<{ success: boolean; error?: string }> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return { success: false, error: 'Not connected to SFTP server' }
      }
      try {
        await this.client.delete(remotePath)
        return { success: true }
      } catch (error) {
        console.error('SFTP deleteFile failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Delete file failed'
        }
      }
    })
  }

  async deleteDirectory(remotePath: string): Promise<{ success: boolean; error?: string }> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return { success: false, error: 'Not connected to SFTP server' }
      }
      try {
        await this.client.rmdir(remotePath, true)
        return { success: true }
      } catch (error) {
        console.error('SFTP deleteDirectory failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Delete directory failed'
        }
      }
    })
  }

  async renameFile(
    oldPath: string,
    newPath: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.queueOperation(async () => {
      if (!this.client || !this.isConnected) {
        return { success: false, error: 'Not connected to SFTP server' }
      }
      try {
        await this.client.rename(oldPath, newPath)
        return { success: true }
      } catch (error) {
        console.error('SFTP renameFile failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Rename failed' }
      }
    })
  }
}
