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
  // 远程文件编辑功能
  startEditingWithEditor: (remotePath: string, editorType: EditorType) => Promise<EditingResult>
  stopEditing: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  getEditingSessions: () => Promise<RemoteFileEditingSession[]>
  forceSync: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  resolveConflict: (
    sessionId: string,
    strategy: ConflictStrategy
  ) => Promise<{ success: boolean; error?: string }>
  onEditingStatusChange: (callback: (session: RemoteFileEditingSession) => void) => () => void
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

// Local Terminal related types
export interface LocalTerminalOptions {
  cwd: string // 工作目录
  shell?: string // 终端类型 (cmd.exe, powershell.exe, bash 等)
  cols?: number // 终端列数
  rows?: number // 终端行数
}

export interface LocalTerminalSession {
  id: string
  isActive: boolean
  cwd: string
}

// 多终端会话管理类型
export interface TerminalSession {
  id: string
  type: 'ssh' | 'local'
  title: string
  isActive: boolean
  // SSH 终端特有属性
  serverInfo?: string
  isConnected?: boolean
  // 本地终端特有属性
  cwd?: string
  localTerminalId?: string
  // 创建时间（用于排序）
  createdAt: number
}

export interface LocalTerminalAPI {
  createTerminal: (options: LocalTerminalOptions) => Promise<{
    success: boolean
    terminalId?: string
    error?: string
  }>

  writeToTerminal: (terminalId: string, data: string) => Promise<void>

  resizeTerminal: (terminalId: string, cols: number, rows: number) => Promise<void>

  closeTerminal: (terminalId: string) => Promise<void>

  onTerminalData: (callback: (terminalId: string, data: string) => void) => () => void

  onTerminalExit: (callback: (terminalId: string, code: number) => void) => () => void
}

// window controls API exposed from preload
export interface WindowControlsAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  on: (event: 'maximize' | 'unmaximize', callback: () => void) => () => void
}

// Electron API类型
export interface ElectronAPI {
  ftp: FTPAPI
  fs: LocalFileSystemAPI
  path: PathAPI
  ssh?: SSHAPI
  localTerminal?: LocalTerminalAPI
  windowControls?: WindowControlsAPI
}

// System-level helpers exposed to renderer
export interface SystemAPI {
  getFonts: () => Promise<{ success: boolean; fonts: string[] }>
}

// 远程文件编辑相关类型定义
export type EditingStatus =
  | 'DOWNLOADING'
  | 'READY'
  | 'EDITING'
  | 'SYNCING'
  | 'CONFLICT'
  | 'ERROR'
  | 'COMPLETED'

export type ConflictStrategy = 'overwrite' | 'merge' | 'cancel'

export type EditorType = 'notepad' | 'vscode'

export interface RemoteFileEditingSession {
  id: string
  remotePath: string
  tempFilePath: string
  status: EditingStatus
  lastModified: Date
  isModified: boolean
  conflictResolution?: ConflictStrategy
  startTime: Date
  lastSyncTime?: Date
  remoteBaseTime?: Date // 远程文件的基准修改时间，用于冲突检测
  error?: string
}

export interface EditingResult {
  success: boolean
  sessionId?: string
  error?: string
}

export interface RemoteFileEditingAPI {
  // 开始编辑远程文件（指定编辑器）
  startEditingWithEditor: (remotePath: string, editorType: EditorType) => Promise<EditingResult>

  // 停止编辑会话
  stopEditing: (sessionId: string) => Promise<{ success: boolean; error?: string }>

  // 获取所有编辑会话
  getEditingSessions: () => Promise<RemoteFileEditingSession[]>

  // 强制同步文件
  forceSync: (sessionId: string) => Promise<{ success: boolean; error?: string }>

  // 解决冲突
  resolveConflict: (
    sessionId: string,
    strategy: ConflictStrategy
  ) => Promise<{ success: boolean; error?: string }>

  // 监听编辑状态变化
  onEditingStatusChange: (callback: (session: RemoteFileEditingSession) => void) => () => void
}

// extend ElectronAPI to include system api
export interface ElectronAPI {
  system?: SystemAPI
  remoteFileEditing?: RemoteFileEditingAPI
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
