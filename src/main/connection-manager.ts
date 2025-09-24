import { FTPService } from './ftp-service'
import { SFTPService } from './sftp-service'
import type {
  FTPCredentials,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  TransferProgress
} from '../types'

// 连接服务接口
interface ConnectionService {
  connect(credentials: FTPCredentials): Promise<FTPConnectionResult>
  disconnect(): Promise<void>
  listDirectory(remotePath?: string): Promise<DirectoryListResult>
  changeDirectory(remotePath: string): Promise<DirectoryListResult>
  uploadFile(localPath: string, remotePath: string, transferId?: string): Promise<TransferResult>
  downloadFile(remotePath: string, localPath: string, transferId?: string): Promise<TransferResult>
  getConnectionStatus(): boolean
  getCurrentCredentials(): FTPCredentials | null
  getCurrentPath(): string
  createDirectory(remotePath: string): Promise<{ success: boolean; error?: string }>
  deleteFile(remotePath: string): Promise<{ success: boolean; error?: string }>
  deleteDirectory(remotePath: string): Promise<{ success: boolean; error?: string }>
  renameFile(oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }>
}

export class ConnectionManager {
  private ftpService: FTPService
  private sftpService: SFTPService
  private currentService: ConnectionService | null = null
  private currentProtocol: 'ftp' | 'sftp' | null = null

  constructor() {
    this.ftpService = new FTPService()
    this.sftpService = new SFTPService()
    // Listen to underlying service errors and suppress common network reset errors
    try {
      this.ftpService.on('error', (err: Error) => {
        try {
          const msg = err && err.message ? err.message : String(err)
          if (msg.includes('ECONNRESET')) {
            console.warn('FTPService error ECONNRESET ignored')
          } else {
            console.error('FTPService error ->', msg)
          }
        } catch {
          /* ignore */
        }
      })
    } catch {
      /* ignore */
    }

    try {
      this.sftpService.on('error', (err: Error) => {
        try {
          const msg = err && err.message ? err.message : String(err)
          if (msg.includes('ECONNRESET')) {
            console.warn('SFTPService error ECONNRESET ignored')
          } else {
            console.error('SFTPService error ->', msg)
          }
        } catch {
          /* ignore */
        }
      })
    } catch {
      /* ignore */
    }
  }

  // 事件代理方法
  on(event: string, listener: (...args: unknown[]) => void): void {
    if (this.currentService && 'on' in this.currentService) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.currentService as any).on(event, listener)
    }
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): void {
    if (this.currentService && 'removeListener' in this.currentService) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.currentService as any).removeListener(event, listener)
    }
  }

  async connect(credentials: FTPCredentials): Promise<FTPConnectionResult> {
    // 断开当前连接
    if (this.currentService) {
      await this.currentService.disconnect()
    }

    // 根据协议选择服务
    if (credentials.protocol === 'sftp') {
      this.currentService = this.sftpService
      this.currentProtocol = 'sftp'
    } else {
      this.currentService = this.ftpService
      this.currentProtocol = 'ftp'
    }

    return await this.currentService.connect(credentials)
  }

  async disconnect(): Promise<void> {
    if (this.currentService) {
      await this.currentService.disconnect()
      this.currentService = null
      this.currentProtocol = null
    }
  }

  async listDirectory(remotePath?: string): Promise<DirectoryListResult> {
    if (!this.currentService) {
      return {
        success: false,
        files: [],
        currentPath: '/',
        error: '未连接到服务器'
      }
    }
    return await this.currentService.listDirectory(remotePath)
  }

  async changeDirectory(remotePath: string): Promise<DirectoryListResult> {
    if (!this.currentService) {
      return {
        success: false,
        files: [],
        currentPath: '/',
        error: '未连接到服务器'
      }
    }
    return await this.currentService.changeDirectory(remotePath)
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    transferId?: string
  ): Promise<TransferResult> {
    if (!this.currentService) {
      return {
        success: false,
        transferId: transferId || 'no_connection',
        error: '未连接到服务器'
      }
    }
    console.log('[ConnectionManager] uploadFile ->', {
      localPath,
      remotePath,
      transferId,
      protocol: this.currentProtocol
    })
    const result = await this.currentService.uploadFile(localPath, remotePath, transferId)
    console.log('[ConnectionManager] uploadFile result ->', result)
    return result
  }

  async createDirectory(remotePath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentService) {
      return { success: false, error: '未连接到服务器' }
    }
    if (!('createDirectory' in this.currentService)) {
      return { success: false, error: '当前协议不支持创建目录' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.currentService as any).createDirectory(remotePath)
  }

  async deleteFile(remotePath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentService) {
      return { success: false, error: '未连接到服务器' }
    }
    if (!('deleteFile' in this.currentService)) {
      return { success: false, error: '当前协议不支持删除文件' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.currentService as any).deleteFile(remotePath)
  }

  async deleteDirectory(remotePath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentService) {
      return { success: false, error: '未连接到服务器' }
    }
    if (!('deleteDirectory' in this.currentService)) {
      return { success: false, error: '当前协议不支持删除目录' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.currentService as any).deleteDirectory(remotePath)
  }

  async renameFile(
    oldPath: string,
    newPath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentService) {
      return { success: false, error: '未连接到服务器' }
    }
    if (!('renameFile' in this.currentService)) {
      return { success: false, error: '当前协议不支持重命名' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.currentService as any).renameFile(oldPath, newPath)
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    transferId?: string
  ): Promise<TransferResult> {
    if (!this.currentService) {
      return {
        success: false,
        transferId: transferId || 'no_connection',
        error: '未连接到服务器'
      }
    }
    return await this.currentService.downloadFile(remotePath, localPath, transferId)
  }

  getConnectionStatus(): boolean {
    return this.currentService ? this.currentService.getConnectionStatus() : false
  }

  getCurrentCredentials(): FTPCredentials | null {
    return this.currentService ? this.currentService.getCurrentCredentials() : null
  }

  getCurrentPath(): string {
    return this.currentService ? this.currentService.getCurrentPath() : '/'
  }

  getCurrentProtocol(): 'ftp' | 'sftp' | null {
    return this.currentProtocol
  }

  // 事件管理
  onTransferProgress(callback: (progress: TransferProgress) => void): () => void {
    const ftpHandler = (progress: TransferProgress): void => callback(progress)
    const sftpHandler = (progress: TransferProgress): void => callback(progress)

    this.ftpService.on('transferProgress', ftpHandler)
    this.sftpService.on('transferProgress', sftpHandler)

    // 返回清理函数
    return () => {
      this.ftpService.removeListener('transferProgress', ftpHandler)
      this.sftpService.removeListener('transferProgress', sftpHandler)
    }
  }
}
