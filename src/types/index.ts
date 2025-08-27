// 共享类型定义，供前端和后端使用

export interface FTPCredentials {
  host: string
  port: number
  username: string
  password: string
  protocol: 'ftp' | 'sftp'
}

export interface SavedFTPConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  protocol: 'ftp' | 'sftp'
  lastUsed: string
  // 注意：出于安全考虑，不保存密码
}

export interface FileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  permissions?: string
  path: string
}

export interface TransferItem {
  id: string
  filename: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'downloading' | 'completed' | 'failed'
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  error?: string
}

export interface FTPConnectionResult {
  success: boolean
  error?: string
  message?: string
}

export interface DirectoryListResult {
  success: boolean
  files: FileItem[]
  currentPath: string
  error?: string
}

export interface TransferResult {
  success: boolean
  transferId: string
  error?: string
}

export interface TransferProgress {
  transferId: string
  progress: number
  status: TransferItem['status']
  error?: string
}

// IPC通信的FTP API类型
export interface FTPAPI {
  connect: (credentials: FTPCredentials) => Promise<FTPConnectionResult>
  disconnect: () => Promise<void>
  listDirectory: (remotePath?: string) => Promise<DirectoryListResult>
  changeDirectory: (remotePath: string) => Promise<DirectoryListResult>
  uploadFile: (localPath: string, remotePath: string) => Promise<TransferResult>
  downloadFile: (remotePath: string, localPath: string) => Promise<TransferResult>
  getCurrentPath: () => Promise<string>
  getConnectionStatus: () => Promise<boolean>
  getCurrentCredentials: () => Promise<FTPCredentials | null>
  onTransferProgress: (callback: (progress: TransferProgress) => void) => () => void
}

// Electron API类型
export interface ElectronAPI {
  ftp: FTPAPI
}

declare global {
  interface Window {
    api: ElectronAPI
    electron: {
      process: {
        platform: string
      }
    }
  }
}
