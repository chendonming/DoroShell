import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ConnectionManager } from './connection-manager'
import { sshService } from './ssh-service'
import { localTerminalService } from './local-terminal-service'
import { RemoteFileEditingService } from './remote-file-editing-service'
import { stat, readdir, writeFile, mkdir, unlink, rmdir, rename } from 'fs/promises'
import { homedir } from 'os'
import type {
  FTPCredentials,
  FTPConnectionResult,
  DirectoryListResult,
  TransferResult,
  LocalFileItem,
  LocalDirectoryResult,
  LocalTerminalOptions,
  EditingResult,
  RemoteFileEditingSession,
  ConflictStrategy
} from '../types'
import type { SSHCredentials } from '../types'

// 创建连接管理器实例
const connectionManager = new ConnectionManager()
// 创建远程文件编辑服务实例
const remoteFileEditingService = new RemoteFileEditingService(connectionManager)
// keep a reference to main window so IPC handlers can control it
let mainWindowRef: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minHeight: 620,
    minWidth: 1200,
    show: false,
    autoHideMenuBar: true,
    // remove system title bar so renderer can draw its own
    frame: false,
    // macOS: hide title bar area to make traffic lights appear inside the window
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // store ref for IPC window controls
  mainWindowRef = mainWindow

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
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

  // Window control IPC handlers
  ipcMain.handle('window:minimize', (): void => {
    try {
      mainWindowRef?.minimize()
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle('window:maximize', (): void => {
    try {
      if (mainWindowRef && !mainWindowRef.isMaximized()) mainWindowRef.maximize()
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle('window:unmaximize', (): void => {
    try {
      if (mainWindowRef && mainWindowRef.isMaximized()) mainWindowRef.unmaximize()
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle('window:is-maximized', (): boolean => {
    try {
      return !!mainWindowRef && mainWindowRef.isMaximized()
    } catch {
      return false
    }
  })

  ipcMain.handle('window:close', (): void => {
    try {
      mainWindowRef?.close()
    } catch {
      /* ignore */
    }
  })

  // forward maximize/unmaximize events to renderer so UI can update
  mainWindow.on('maximize', () => {
    try {
      mainWindow.webContents.send('window:maximize')
    } catch {
      /* ignore */
    }
  })

  mainWindow.on('unmaximize', () => {
    try {
      mainWindow.webContents.send('window:unmaximize')
    } catch {
      /* ignore */
    }
  })

  // 监听传输进度事件
  connectionManager.on('transferProgress', (progress) => {
    mainWindow?.webContents.send('transferProgress', progress)
  })

  // 监听远程文件编辑状态变化
  remoteFileEditingService.on('statusChange', (session: RemoteFileEditingSession) => {
    try {
      mainWindow?.webContents.send('remote-file:status-change', session)
    } catch (error) {
      console.error('Failed to send editing status change:', error)
    }
  })

  // SSH 服务数据转发
  sshService.on('data', (data: string) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[main] ssh:data preview ->', data.slice(0, 200))
      }
    } catch {
      /* ignore */
    }
    mainWindow?.webContents.send('ssh:data', data)
  })

  // 本地终端服务数据转发
  localTerminalService.on('data', (terminalId: string, data: string) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[main] local-terminal:data preview ->', terminalId, data.slice(0, 100))
      }
      mainWindow?.webContents.send('local-terminal:data', terminalId, data)
    } catch {
      /* ignore */
    }
  })

  localTerminalService.on('exit', (terminalId: string, exitCode: number) => {
    try {
      console.log('[main] local-terminal:exit ->', terminalId, exitCode)
      mainWindow?.webContents.send('local-terminal:exit', terminalId, exitCode)
    } catch {
      /* ignore */
    }
  })

  // 捕获 sshService 的错误，避免未处理的 'error' 事件导致进程异常退出
  sshService.on('error', (err: Error) => {
    try {
      console.warn(
        '[ssh-service] error (caught) ->',
        err && err.message ? err.message : String(err)
      )
    } catch {
      /* ignore */
    }
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

  // 全局异常防护，记录未捕获异常/拒绝并在常见网络重置错误上忽略，以避免系统弹窗
  process.on('uncaughtException', (err: Error) => {
    try {
      const msg = err && err.message ? err.message : String(err)
      if (msg.includes('ECONNRESET')) {
        console.warn('[process] uncaughtException ECONNRESET ignored ->', msg)
      } else {
        console.error('[process] uncaughtException ->', msg)
      }
    } catch {
      /* ignore */
    }
  })

  process.on('unhandledRejection', (reason) => {
    try {
      const msg = reason instanceof Error ? reason.message : String(reason)
      if (msg.includes('ECONNRESET')) {
        console.warn('[process] unhandledRejection ECONNRESET ignored ->', msg)
      } else {
        console.error('[process] unhandledRejection ->', msg)
      }
    } catch {
      /* ignore */
    }
  })

  // FTP连接处理
  ipcMain.handle(
    'ftp:connect',
    async (_, credentials: FTPCredentials): Promise<FTPConnectionResult> => {
      try {
        const result = await connectionManager.connect(credentials)

        // If this is an SFTP connection, also attempt to open an SSH shell for the terminal
        if (result.success && credentials.protocol === 'sftp') {
          try {
            const sshRes = await sshService.connect({
              host: credentials.host,
              port: credentials.port,
              username: credentials.username,
              password: credentials.password
            })
            if (!sshRes.success) {
              console.warn('SSH shell connection failed:', sshRes.error)
              // append message but keep primary SFTP connection result
              if (!result.message) result.message = ''
              result.message += ` SSH shell: ${sshRes.error || 'failed'}`
            }
          } catch (err) {
            console.warn('SSH shell connect attempt threw:', err)
          }
        }

        return result
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
    try {
      await connectionManager.disconnect()
    } catch (err) {
      console.warn('[main] ftp:disconnect error ->', err)
    } finally {
      // Ensure SSH shell is also closed when the user requests an FTP disconnect
      try {
        await sshService.disconnect()
      } catch (err) {
        console.warn('[main] sshService.disconnect error ->', err)
      }
    }
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

  ipcMain.handle(
    'ftp:get-connection-status',
    (): { connected: boolean; protocols: Array<'ftp' | 'sftp' | 'ssh'> } => {
      try {
        const protocols: Array<'ftp' | 'sftp' | 'ssh'> = []
        const cmConnected = connectionManager.getConnectionStatus()
        if (cmConnected) {
          // If connection manager has a current protocol, include it
          const proto = connectionManager.getCurrentProtocol()
          if (proto === 'ftp') protocols.push('ftp')
          if (proto === 'sftp') protocols.push('sftp')
        }

        // SSH shell presence should be represented separately
        if (sshService.getConnectionStatus()) {
          // only push 'ssh' if not already present
          if (!protocols.includes('ssh')) protocols.push('ssh')
        }

        const connected = cmConnected || sshService.getConnectionStatus()

        return {
          connected,
          protocols
        }
      } catch (err) {
        try {
          console.warn('[main] get-connection-status error ->', err)
        } catch {
          /* ignore */
        }
        return { connected: false, protocols: [] }
      }
    }
  )

  ipcMain.handle('ftp:get-current-credentials', (): FTPCredentials | null => {
    return connectionManager.getCurrentCredentials()
  })

  // SSH IPC handlers
  ipcMain.handle('ssh:connect', async (_, credentials: SSHCredentials) => {
    try {
      const res = await sshService.connect(credentials)
      return res
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'ssh connect error' }
    }
  })

  ipcMain.handle('ssh:disconnect', async () => {
    try {
      await sshService.disconnect()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'ssh disconnect error' }
    }
  })

  ipcMain.handle('ssh:send', async (_, data: string) => {
    try {
      await sshService.send(data)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'ssh send error' }
    }
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

  // 返回系统字体列表（简单实现：扫描常见系统字体目录并返回文件名的基名作为字体候选）
  ipcMain.handle('system:get-fonts', async function (): Promise<{
    success: boolean
    fonts: string[]
  }> {
    try {
      const os = await import('os')
      const fs = await import('fs/promises')
      const path = await import('path')

      const dirs: string[] = []
      const platform = process.platform
      if (platform === 'win32') {
        dirs.push(path.join(process.env['WINDIR'] || 'C:\\Windows', 'Fonts'))
      } else if (platform === 'darwin') {
        dirs.push(
          '/Library/Fonts',
          '/System/Library/Fonts',
          path.join(os.homedir(), 'Library', 'Fonts')
        )
      } else {
        // linux and others
        dirs.push('/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'))
      }

      const fontSet = new Set<string>()

      for (const dir of dirs) {
        try {
          const files = await fs.readdir(dir)
          for (const f of files) {
            // ignore hidden files
            if (!f || f.startsWith('.')) continue
            const ext = path.extname(f).toLowerCase()
            if (['.ttf', '.otf', '.ttc', '.woff', '.woff2'].includes(ext)) {
              const name = path.basename(f, ext)
              // make name more friendly: replace '_' and '-' with space
              const friendly = name.replace(/[_-]+/g, ' ')
              fontSet.add(friendly)
            }
          }
        } catch {
          // ignore missing dirs
        }
      }

      const fonts = Array.from(fontSet).sort((a, b) => a.localeCompare(b))
      return { success: true, fonts }
    } catch (error) {
      console.warn('system:get-fonts failed ->', error)
      return { success: false, fonts: [] }
    }
  })

  // ===== 远程文件编辑 IPC 处理器 =====
  ipcMain.handle(
    'remote-file:start-editing-with-editor',
    async (_, remotePath: string, editorType: 'notepad' | 'vscode'): Promise<EditingResult> => {
      try {
        return await remoteFileEditingService.startEditingWithEditor(remotePath, editorType)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '启动编辑失败'
        }
      }
    }
  )

  ipcMain.handle(
    'remote-file:stop-editing',
    async (_, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        return await remoteFileEditingService.stopEditing(sessionId)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '停止编辑失败'
        }
      }
    }
  )

  ipcMain.handle('remote-file:get-sessions', async (): Promise<RemoteFileEditingSession[]> => {
    try {
      return remoteFileEditingService.getEditingSessions()
    } catch (error) {
      console.error('Failed to get editing sessions:', error)
      return []
    }
  })

  ipcMain.handle(
    'remote-file:force-sync',
    async (_, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        return await remoteFileEditingService.forceSync(sessionId)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '强制同步失败'
        }
      }
    }
  )

  ipcMain.handle(
    'remote-file:resolve-conflict',
    async (
      _,
      sessionId: string,
      strategy: ConflictStrategy
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        return await remoteFileEditingService.resolveConflict(sessionId, strategy)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '解决冲突失败'
        }
      }
    }
  )

  // 本地终端IPC处理程序
  ipcMain.handle('local-terminal:create', async (_, options: LocalTerminalOptions) => {
    try {
      return await localTerminalService.createTerminal(options)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建本地终端失败'
      }
    }
  })

  ipcMain.handle('local-terminal:write', async (_, terminalId: string, data: string) => {
    try {
      await localTerminalService.writeToTerminal(terminalId, data)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '写入终端失败'
      }
    }
  })

  ipcMain.handle(
    'local-terminal:resize',
    async (_, terminalId: string, cols: number, rows: number) => {
      try {
        await localTerminalService.resizeTerminal(terminalId, cols, rows)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '调整终端大小失败'
        }
      }
    }
  )

  ipcMain.handle('local-terminal:close', async (_, terminalId: string) => {
    try {
      await localTerminalService.closeTerminal(terminalId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '关闭终端失败'
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
app.on('window-all-closed', async () => {
  // 清理所有本地终端
  try {
    await localTerminalService.cleanup()
  } catch (error) {
    console.error('清理本地终端失败:', error)
  }

  // 清理远程文件编辑服务
  try {
    await remoteFileEditingService.cleanup()
  } catch (error) {
    console.error('清理远程文件编辑服务失败:', error)
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
