import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ConnectionManager } from './connection-manager'
import { stat, readdir, writeFile, mkdir, unlink, rmdir, rename } from 'fs/promises'
import { homedir } from 'os'
import type {
  FTPCredentials,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  LocalFileItem,
  LocalDirectoryResult
} from '../types'

// 创建连接管理器实例
const connectionManager = new ConnectionManager()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 监听传输进度事件
  connectionManager.on('transferProgress', (progress) => {
    mainWindow?.webContents.send('transferProgress', progress)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // FTP连接处理
  ipcMain.handle(
    'ftp:connect',
    async (_, credentials: FTPCredentials): Promise<FTPConnectionResult> => {
      try {
        return await connectionManager.connect(credentials)
      } catch (error) {
        console.error('连接失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '连接失败'
        }
      }
    }
  )

  ipcMain.handle('ftp:disconnect', async (): Promise<void> => {
    return await connectionManager.disconnect()
  })

  ipcMain.handle(
    'ftp:list-directory',
    async (_, remotePath?: string): Promise<DirectoryListResult> => {
      return await connectionManager.listDirectory(remotePath)
    }
  )

  ipcMain.handle(
    'ftp:change-directory',
    async (_, remotePath: string): Promise<DirectoryListResult> => {
      return await connectionManager.changeDirectory(remotePath)
    }
  )

  ipcMain.handle(
    'ftp:upload-file',
    async (_, localPath: string, remotePath: string): Promise<TransferResult> => {
      console.log('[IPC] ftp:upload-file called ->', { localPath, remotePath })
      const result = await connectionManager.uploadFile(localPath, remotePath)
      console.log('[IPC] ftp:upload-file result ->', result)
      return result
    }
  )

  // 处理拖拽文件上传
  ipcMain.handle(
    'ftp:upload-dragged-file',
    async (
      _,
      fileBuffer: ArrayBuffer,
      fileName: string,
      remotePath: string
    ): Promise<TransferResult> => {
      const os = await import('os')
      const fs = await import('fs/promises')
      const path = await import('path')

      try {
        console.log('[IPC] ftp:upload-dragged-file called ->', { fileName, remotePath })
        // 创建临时文件
        const tempDir = os.tmpdir()
        const tempFilePath = path.join(tempDir, `drag_upload_${Date.now()}_${fileName}`)

        // 将ArrayBuffer写入临时文件
        await fs.writeFile(tempFilePath, Buffer.from(fileBuffer))

        // 上传文件
        console.log('[IPC] ftp:upload-dragged-file tempFile ->', tempFilePath)
        const result = await connectionManager.uploadFile(tempFilePath, remotePath)
        console.log('[IPC] ftp:upload-dragged-file result ->', result)

        // 清理临时文件
        try {
          await fs.unlink(tempFilePath)
        } catch (error) {
          console.warn('Failed to cleanup temp file:', error)
        }

        return result
      } catch (error) {
        return {
          success: false,
          transferId: `failed_${Date.now()}`,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    }
  )

  ipcMain.handle(
    'ftp:download-file',
    async (_, remotePath: string, localPath: string): Promise<TransferResult> => {
      return await connectionManager.downloadFile(remotePath, localPath)
    }
  )

  ipcMain.handle('ftp:get-current-path', (): string => {
    return connectionManager.getCurrentPath()
  })

  ipcMain.handle('ftp:get-connection-status', (): boolean => {
    return connectionManager.getConnectionStatus()
  })

  ipcMain.handle('ftp:get-current-credentials', (): FTPCredentials | null => {
    return connectionManager.getCurrentCredentials()
  })

  // 远程文件管理操作（创建、删除、重命名）
  ipcMain.handle('ftp:create-directory', async (_, remotePath: string) => {
    try {
      return await connectionManager.createDirectory(remotePath)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '创建远程目录失败' }
    }
  })

  ipcMain.handle('ftp:delete-file', async (_, remotePath: string) => {
    try {
      return await connectionManager.deleteFile(remotePath)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除远程文件失败' }
    }
  })

  ipcMain.handle('ftp:delete-directory', async (_, remotePath: string) => {
    try {
      return await connectionManager.deleteDirectory(remotePath)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除远程目录失败' }
    }
  })

  ipcMain.handle('ftp:rename-file', async (_, oldPath: string, newPath: string) => {
    try {
      return await connectionManager.renameFile(oldPath, newPath)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '重命名远程文件失败'
      }
    }
  })

  // 本地文件系统 API
  ipcMain.handle('fs:read-directory', async (_, dirPath: string): Promise<LocalDirectoryResult> => {
    try {
      const files = await readdir(dirPath, { withFileTypes: true })
      const fileItems: LocalFileItem[] = []

      for (const file of files) {
        try {
          const fullPath = join(dirPath, file.name)
          const stats = await stat(fullPath)

          fileItems.push({
            name: file.name,
            type: file.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
            path: fullPath
          })
        } catch (error) {
          console.warn(`跳过文件 ${file.name}:`, error)
        }
      }

      return {
        success: true,
        files: fileItems.sort((a, b) => {
          // 目录优先，然后按名称排序
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1
          }
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        }),
        currentPath: dirPath
      }
    } catch (error) {
      return {
        success: false,
        files: [],
        currentPath: dirPath,
        error: error instanceof Error ? error.message : '读取目录失败'
      }
    }
  })

  ipcMain.handle('fs:get-file-stats', async (_, filePath: string) => {
    try {
      const stats = await stat(filePath)
      return {
        success: true,
        stats: {
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          modified: stats.mtime.toISOString()
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取文件信息失败'
      }
    }
  })

  // 创建文件
  ipcMain.handle('fs:create-file', async (_, dirPath: string, filename: string) => {
    try {
      const filePath = join(dirPath, filename)
      await writeFile(filePath, '', 'utf8')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建文件失败'
      }
    }
  })

  // 创建文件夹
  ipcMain.handle('fs:create-directory', async (_, dirPath: string, dirname: string) => {
    try {
      const fullPath = join(dirPath, dirname)
      await mkdir(fullPath)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建文件夹失败'
      }
    }
  })

  // 删除文件
  ipcMain.handle('fs:delete-file', async (_, filePath: string) => {
    console.log('[IPC] fs:delete-file called ->', filePath)
    try {
      await unlink(filePath)
      console.log('[IPC] fs:delete-file success ->', filePath)
      return { success: true }
    } catch (error) {
      console.error('[IPC] fs:delete-file failed ->', filePath, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除文件失败'
      }
    }
  })

  // 删除文件夹
  ipcMain.handle('fs:delete-directory', async (_, dirPath: string) => {
    console.log('[IPC] fs:delete-directory called ->', dirPath)
    try {
      await rmdir(dirPath)
      console.log('[IPC] fs:delete-directory success ->', dirPath)
      return { success: true }
    } catch (error) {
      console.error('[IPC] fs:delete-directory failed ->', dirPath, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除文件夹失败'
      }
    }
  })

  // 重命名文件
  ipcMain.handle('fs:rename-file', async (_, oldPath: string, newPath: string) => {
    console.log('[IPC] fs:rename-file called ->', { oldPath, newPath })
    try {
      await rename(oldPath, newPath)
      console.log('[IPC] fs:rename-file success ->', { oldPath, newPath })
      return { success: true }
    } catch (error) {
      console.error('[IPC] fs:rename-file failed ->', { oldPath, newPath, error })
      return {
        success: false,
        error: error instanceof Error ? error.message : '重命名失败'
      }
    }
  })

  // 路径操作 API
  ipcMain.handle('path:get-home-path', (): string => {
    return homedir()
  })

  ipcMain.handle('path:get-parent-path', (_, currentPath: string): string => {
    return join(currentPath, '..')
  })

  ipcMain.handle('path:join-path', (_, ...paths: string[]): string => {
    return join(...paths)
  })

  ipcMain.handle('path:resolve-path', (_, path: string): string => {
    return join(path)
  })

  ipcMain.handle('path:get-downloads-path', (): string => {
    // 返回用户的下载文件夹路径
    return join(homedir(), 'Downloads')
  })

  // 在系统文件管理器中显示指定路径
  ipcMain.handle('path:show-item-in-folder', async (_, targetPath: string) => {
    try {
      // shell.showItemInFolder 在系统文件管理器中高亮显示指定路径（返回 void）
      shell.showItemInFolder(targetPath)
      return { success: true }
    } catch (error) {
      console.warn(
        '[IPC] shell.showItemInFolder failed, fallback to openPath ->',
        targetPath,
        error
      )
      try {
        const openResult = await shell.openPath(targetPath)
        if (!openResult) {
          return { success: true }
        }
        return { success: false, error: openResult }
      } catch (err) {
        console.error('[IPC] path:show-item-in-folder failed ->', targetPath, err)
        return { success: false, error: err instanceof Error ? err.message : '打开路径失败' }
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
