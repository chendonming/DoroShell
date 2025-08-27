import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  FTPCredentials,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  TransferProgress,
  ElectronAPI
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

    downloadFile: (remotePath: string, localPath: string): Promise<TransferResult> =>
      ipcRenderer.invoke('ftp:download-file', remotePath, localPath),

    getCurrentPath: (): Promise<string> => ipcRenderer.invoke('ftp:get-current-path'),

    getConnectionStatus: (): Promise<boolean> => ipcRenderer.invoke('ftp:get-connection-status'),

    getCurrentCredentials: (): Promise<FTPCredentials | null> =>
      ipcRenderer.invoke('ftp:get-current-credentials'),

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
