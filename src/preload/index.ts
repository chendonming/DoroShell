import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  FTPCredentials,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  TransferProgress,
  ElectronAPI,
  LocalDirectoryResult
} from '../types'

// Custom APIs for renderer
const api: ElectronAPI = {
  ftp: {
    connect: (credentials: FTPCredentials): Promise<FTPConnectionResult> =>
      ipcRenderer.invoke('ftp:connect', credentials),

    disconnect: (): Promise<void> => ipcRenderer.invoke('ftp:disconnect'),

    listDirectory: (remotePath?: string): Promise<DirectoryListResult> =>
      ipcRenderer.invoke('ftp:list-directory', remotePath),

    changeDirectory: (remotePath: string): Promise<DirectoryListResult> =>
      ipcRenderer.invoke('ftp:change-directory', remotePath),

    uploadFile: (localPath: string, remotePath: string): Promise<TransferResult> =>
      ipcRenderer.invoke('ftp:upload-file', localPath, remotePath),

    uploadDraggedFile: (
      fileBuffer: ArrayBuffer,
      fileName: string,
      remotePath: string
    ): Promise<TransferResult> =>
      ipcRenderer.invoke('ftp:upload-dragged-file', fileBuffer, fileName, remotePath),

    downloadFile: (
      remotePath: string,
      localPath: string,
      transferId?: string
    ): Promise<TransferResult> =>
      ipcRenderer.invoke('ftp:download-file', remotePath, localPath, transferId),

    getCurrentPath: (): Promise<string> => ipcRenderer.invoke('ftp:get-current-path'),

    getConnectionStatus: (): Promise<import('../types').ConnectionStatus> =>
      ipcRenderer.invoke('ftp:get-connection-status'),

    getCurrentCredentials: (): Promise<FTPCredentials | null> =>
      ipcRenderer.invoke('ftp:get-current-credentials'),

    createDirectory: (remotePath: string) => ipcRenderer.invoke('ftp:create-directory', remotePath),

    deleteFile: (remotePath: string) => ipcRenderer.invoke('ftp:delete-file', remotePath),

    deleteDirectory: (remotePath: string) => ipcRenderer.invoke('ftp:delete-directory', remotePath),

    renameFile: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('ftp:rename-file', oldPath, newPath),

    onTransferProgress: (callback: (progress: TransferProgress) => void) => {
      const handleProgress = (
        _event: Electron.IpcRendererEvent,
        progress: TransferProgress
      ): void => callback(progress)
      ipcRenderer.on('transfer-progress', handleProgress)

      // 返回清理函数
      return (): void => {
        ipcRenderer.removeListener('transfer-progress', handleProgress)
      }
    }
  },

  fs: {
    readDirectory: (path: string): Promise<LocalDirectoryResult> =>
      ipcRenderer.invoke('fs:read-directory', path),

    getFileStats: (path: string) => ipcRenderer.invoke('fs:get-file-stats', path),

    createFile: (path: string, filename: string) =>
      ipcRenderer.invoke('fs:create-file', path, filename),

    createDirectory: (path: string, dirname: string) =>
      ipcRenderer.invoke('fs:create-directory', path, dirname),

    deleteFile: (path: string) => ipcRenderer.invoke('fs:delete-file', path),

    deleteDirectory: (path: string) => ipcRenderer.invoke('fs:delete-directory', path),

    renameFile: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename-file', oldPath, newPath)
  },

  path: {
    getHomePath: (): Promise<string> => ipcRenderer.invoke('path:get-home-path'),

    getParentPath: (path: string): Promise<string> =>
      ipcRenderer.invoke('path:get-parent-path', path),

    joinPath: (...paths: string[]): Promise<string> =>
      ipcRenderer.invoke('path:join-path', ...paths),

    resolvePath: (path: string): Promise<string> => ipcRenderer.invoke('path:resolve-path', path),

    getDownloadsPath: (): Promise<string> => ipcRenderer.invoke('path:get-downloads-path'),
    // 在系统文件管理器中显示指定路径
    showItemInFolder: (path: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('path:show-item-in-folder', path)
  }
}

// Window control API
const windowControls = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  unmaximize: (): Promise<void> => ipcRenderer.invoke('window:unmaximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  on: (event: 'maximize' | 'unmaximize', callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(`window:${event}`, handler)
    return (): void => {
      ipcRenderer.removeListener(`window:${event}`, handler)
    }
  }
}

// attach to api for convenience
// @ts-ignore
api.windowControls = windowControls

// SSH 相关的桥接 API（可选，如果主进程未实现，则返回失败）
// Implement a small buffering layer so data sent from main before the renderer
// subscribes won't be lost. We keep a short in-memory buffer and replay it when
// the renderer registers a listener.
const sshBuffer: string[] = []
const ipcHandler = (_event: Electron.IpcRendererEvent, data: string): void => {
  // push incoming data into buffer; keep buffer reasonably bounded
  try {
    sshBuffer.push(data)
    if (sshBuffer.length > 200) {
      // drop old entries if buffer grows too large
      sshBuffer.shift()
    }
  } catch {
    // ignore
  }
}

ipcRenderer.on('ssh:data', ipcHandler)

api.ssh = {
  connect: (credentials) => ipcRenderer.invoke('ssh:connect', credentials),
  disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
  send: (data: string) => ipcRenderer.invoke('ssh:send', data),
  onData: (callback: (data: string) => void) => {
    // replay buffered data synchronously first
    try {
      for (const chunk of sshBuffer) {
        callback(chunk)
      }
    } catch {
      // ignore replay errors
    }

    // then register live handler
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on('ssh:data', handler)

    return (): void => {
      ipcRenderer.removeListener('ssh:data', handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
