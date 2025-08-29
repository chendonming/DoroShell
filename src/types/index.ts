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
  password: string // 保存密码以便一键登录
  protocol: 'ftp' | 'sftp'
  lastUsed: string
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
  batchId?: string
  error?: string
  draggedFile?: File // 用于支持拖拽上传的文件
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

// 本地文件系统类型
export interface LocalFileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  path: string
}

export interface LocalDirectoryResult {
  success: boolean
  files?: LocalFileItem[]
  currentPath: string
  error?: string
}

// 本地文件系统 API
export interface LocalFileSystemAPI {
  readDirectory: (path: string) => Promise<LocalDirectoryResult>
  getFileStats: (path: string) => Promise<{
    success: boolean
    stats?: {
      size: number
      isFile: boolean
      isDirectory: boolean
      modified: string
    }
    error?: string
  }>
  createFile: (path: string, filename: string) => Promise<{ success: boolean; error?: string }>
  createDirectory: (path: string, dirname: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>
  deleteDirectory: (path: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
}

// 路径操作 API
export interface PathAPI {
  getHomePath: () => Promise<string>
  getParentPath: (path: string) => Promise<string>
  joinPath: (...paths: string[]) => Promise<string>
  resolvePath: (path: string) => Promise<string>
  getDownloadsPath: () => Promise<string>
  // 在系统文件管理器中显示/打开指定路径
  showItemInFolder: (path: string) => Promise<{ success: boolean; error?: string }>
}

// IPC通信的FTP API类型
export interface FTPAPI {
  connect: (credentials: FTPCredentials) => Promise<FTPConnectionResult>
  disconnect: () => Promise<void>
  listDirectory: (remotePath?: string) => Promise<DirectoryListResult>
  changeDirectory: (remotePath: string) => Promise<DirectoryListResult>
  uploadFile: (localPath: string, remotePath: string) => Promise<TransferResult>
  uploadDraggedFile: (
    fileBuffer: ArrayBuffer,
    fileName: string,
    remotePath: string
  ) => Promise<TransferResult>
  downloadFile: (
    remotePath: string,
    localPath: string,
    transferId?: string
  ) => Promise<TransferResult>
  getCurrentPath: () => Promise<string>
  // 返回统一的连接状态对象，包含是否已连接以及可用协议列表（例如 ['ssh','sftp']）
  getConnectionStatus: () => Promise<ConnectionStatus>
  getCurrentCredentials: () => Promise<FTPCredentials | null>
  onTransferProgress: (callback: (progress: TransferProgress) => void) => () => void
  createDirectory: (remotePath: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (remotePath: string) => Promise<{ success: boolean; error?: string }>
  deleteDirectory: (remotePath: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
}

// 统一的连接状态表示
export interface ConnectionStatus {
  connected: boolean
  // 可用协议，例如 ['sftp'] 或 ['ssh'] 或 ['ssh','sftp']
  protocols: Array<'ftp' | 'sftp' | 'ssh'>
}

// SSH Terminal related types
export interface SSHCredentials {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

export interface SSHAPI {
  connect: (credentials: SSHCredentials) => Promise<{ success: boolean; error?: string }>
  disconnect: () => Promise<void>
  send: (data: string) => Promise<void>
  onData: (callback: (data: string) => void) => () => void
}

// Electron API类型
export interface ElectronAPI {
  ftp: FTPAPI
  fs: LocalFileSystemAPI
  path: PathAPI
  ssh?: SSHAPI
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
