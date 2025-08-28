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

    getConnectionStatus: (): Promise<boolean> => ipcRenderer.invoke('ftp:get-connection-status'),

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
