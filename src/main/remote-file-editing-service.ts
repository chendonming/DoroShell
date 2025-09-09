import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import { join, dirname, basename } from 'path'
import { tmpdir } from 'os'
import * as chokidar from 'chokidar'
import type { RemoteFileEditingSession, ConflictStrategy, EditingResult } from '../types'
import type { ConnectionManager } from './connection-manager'

/**
 * 远程文件编辑服务
 * 负责管理远程文件的本地编辑会话，包括文件下载、编辑器启动、文件监控和自动同步
 */
export class RemoteFileEditingService extends EventEmitter {
  private sessions = new Map<string, RemoteFileEditingSession>()
  private fileWatchers = new Map<string, chokidar.FSWatcher>()
  private editorProcesses = new Map<string, ChildProcess>()
  private sessionTimeouts = new Map<string, NodeJS.Timeout>()
  private monitorIntervals = new Map<string, NodeJS.Timeout>() // 单独存储监控间隔
  private tempDir: string
  private connectionManager: ConnectionManager

  constructor(connectionManager: ConnectionManager) {
    super()
    this.connectionManager = connectionManager
    this.tempDir = join(tmpdir(), 'electron-ftp-editing')
    this.initializeTempDirectory()
    // 移除自动编辑器检测，改为用户选择
  }

  /**
   * 初始化临时目录
   */
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create temp directory:', error)
      throw new Error('无法创建临时目录')
    }
  }

  /**
   * 开始编辑远程文件（指定编辑器）
   */
  public async startEditingWithEditor(
    remotePath: string,
    editorType: 'notepad' | 'vscode'
  ): Promise<EditingResult> {
    try {
      // 检查是否已有相同文件的编辑会话
      const existingSession = this.findSessionByRemotePath(remotePath)
      if (existingSession) {
        return {
          success: false,
          error: '该文件正在编辑中'
        }
      }

      // 检查连接状态
      if (!this.connectionManager.getConnectionStatus()) {
        return {
          success: false,
          error: '未连接到远程服务器'
        }
      }

      // 创建会话
      const sessionId = this.generateSessionId()
      const tempFilePath = await this.createTempFilePath(remotePath)

      const session: RemoteFileEditingSession = {
        id: sessionId,
        remotePath,
        tempFilePath,
        status: 'DOWNLOADING',
        lastModified: new Date(),
        isModified: false,
        startTime: new Date()
      }

      this.sessions.set(sessionId, session)
      this.emitStatusChange(session)

      // 下载远程文件
      const downloadResult = await this.downloadRemoteFile(remotePath, tempFilePath)
      if (!downloadResult.success) {
        this.cleanupSession(sessionId)
        return {
          success: false,
          error: downloadResult.error || '下载文件失败'
        }
      }

      // 获取远程文件的修改时间作为基准
      const remoteFileInfo = await this.getRemoteFileInfo(remotePath)
      if (remoteFileInfo) {
        session.remoteBaseTime = remoteFileInfo.modified
      }

      // 更新会话状态
      session.status = 'READY'
      session.lastModified = new Date()
      this.emitStatusChange(session)

      // 启动文件监控
      await this.startFileWatcher(sessionId)

      // 使用指定编辑器打开文件
      const editorResult = await this.openEditorWithType(tempFilePath, sessionId, editorType)
      if (!editorResult.success) {
        this.cleanupSession(sessionId)
        return {
          success: false,
          error: editorResult.error || '无法启动编辑器'
        }
      }

      // 更新状态为编辑中
      session.status = 'EDITING'
      this.emitStatusChange(session)

      return {
        success: true,
        sessionId
      }
    } catch (error) {
      console.error('Failed to start editing:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '启动编辑失败'
      }
    }
  }

  /**
   * 停止编辑会话
   */
  public async stopEditing(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        return {
          success: false,
          error: '编辑会话不存在'
        }
      }

      // 如果文件已修改，先同步到远程
      if (session.isModified && session.status !== 'ERROR') {
        const syncResult = await this.uploadChanges(sessionId)
        if (!syncResult.success) {
          return {
            success: false,
            error: `同步失败: ${syncResult.error}`
          }
        }
      }

      // 清理会话
      await this.cleanupSession(sessionId)

      return { success: true }
    } catch (error) {
      console.error('Failed to stop editing:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '停止编辑失败'
      }
    }
  }

  /**
   * 获取所有编辑会话
   */
  public getEditingSessions(): RemoteFileEditingSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 强制同步文件
   */
  public async forceSync(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return {
        success: false,
        error: '编辑会话不存在'
      }
    }

    return await this.uploadChanges(sessionId)
  }

  /**
   * 解决冲突
   */
  public async resolveConflict(
    sessionId: string,
    strategy: ConflictStrategy
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return {
        success: false,
        error: '编辑会话不存在'
      }
    }

    session.conflictResolution = strategy

    switch (strategy) {
      case 'overwrite':
        // 强制覆盖远程文件
        return await this.uploadChanges(sessionId, true)

      case 'cancel':
        // 取消编辑，恢复到远程版本
        try {
          const downloadResult = await this.downloadRemoteFile(
            session.remotePath,
            session.tempFilePath
          )
          if (downloadResult.success) {
            session.status = 'EDITING'
            session.isModified = false
            this.emitStatusChange(session)
            return { success: true }
          } else {
            return {
              success: false,
              error: '恢复远程版本失败'
            }
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : '恢复失败'
          }
        }

      case 'merge':
        // 合并策略暂时不实现，返回错误
        return {
          success: false,
          error: '合并功能暂未实现'
        }

      default:
        return {
          success: false,
          error: '无效的冲突解决策略'
        }
    }
  }

  /**
   * 清理会话资源
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      // 清除会话超时
      this.clearSessionTimeout(sessionId)

      // 清除监控间隔
      const monitorInterval = this.monitorIntervals.get(sessionId)
      if (monitorInterval) {
        clearInterval(monitorInterval)
        this.monitorIntervals.delete(sessionId)
      }

      // 停止文件监控
      const watcher = this.fileWatchers.get(sessionId)
      if (watcher) {
        await watcher.close()
        this.fileWatchers.delete(sessionId)
      }

      // 清理编辑器进程（不强制杀掉，让用户自己关闭）
      this.editorProcesses.delete(sessionId)

      // 清理临时文件
      try {
        await fs.unlink(session.tempFilePath)
      } catch (error) {
        console.warn('Failed to cleanup temp file:', error)
      }

      // 删除会话
      this.sessions.delete(sessionId)

      // 发送会话完成事件
      session.status = 'COMPLETED'
      this.emitStatusChange(session)
    } catch (error) {
      console.error('Failed to cleanup session:', error)
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 创建临时文件路径
   */
  private async createTempFilePath(remotePath: string): Promise<string> {
    const fileName = basename(remotePath)
    const timestamp = Date.now()
    const tempFileName = `${timestamp}_${fileName}`
    return join(this.tempDir, tempFileName)
  }

  /**
   * 下载远程文件
   */
  private async downloadRemoteFile(
    remotePath: string,
    localPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 确保本地目录存在
      await fs.mkdir(dirname(localPath), { recursive: true })

      // 使用连接管理器下载文件
      const result = await this.connectionManager.downloadFile(remotePath, localPath)
      return {
        success: result.success,
        error: result.error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '下载失败'
      }
    }
  }

  /**
   * 启动文件监控
   */
  private async startFileWatcher(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const watcher = chokidar.watch(session.tempFilePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })

    watcher.on('change', async () => {
      try {
        session.isModified = true
        session.lastModified = new Date()

        // 重置会话超时（有活动时延长超时）
        this.setSessionTimeout(sessionId)

        // 自动同步到远程
        const syncResult = await this.uploadChanges(sessionId)
        if (!syncResult.success) {
          session.status = 'ERROR'
          session.error = syncResult.error
        }

        this.emitStatusChange(session)
      } catch (error) {
        console.error('File watcher error:', error)
      }
    })

    // 监听文件删除（可能表示编辑器已关闭）
    watcher.on('unlink', async () => {
      console.log(`Temp file deleted for session ${sessionId}, cleaning up session...`)
      // 延迟一些时间再清理，防止误删
      setTimeout(async () => {
        await this.cleanupSession(sessionId)
      }, 2000)
    })

    watcher.on('error', (error) => {
      console.error('File watcher error:', error)
      session.status = 'ERROR'
      session.error = '文件监控异常'
      this.emitStatusChange(session)
    })

    this.fileWatchers.set(sessionId, watcher)
  }

  /**
   * 使用指定类型的编辑器打开文件
   */
  private async openEditorWithType(
    filePath: string,
    sessionId: string,
    editorType: 'notepad' | 'vscode'
  ): Promise<{ success: boolean; error?: string }> {
    // 验证文件是否已准备好
    const fileReady = await this.verifyFileReady(filePath)
    if (!fileReady.success) {
      return fileReady
    }

    let executable: string
    let args: string[]

    // 根据用户选择配置编辑器
    switch (editorType) {
      case 'vscode':
        executable = 'code'
        args = ['--wait', filePath]
        break
      case 'notepad':
        executable = 'notepad.exe'
        args = [filePath]
        break
      default:
        return {
          success: false,
          error: '不支持的编辑器类型'
        }
    }

    try {
      const editorProcess = spawn(executable, args, {
        detached: false, // 改为false以便监听进程退出
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: false,
        shell: editorType === 'vscode'
      })

      // 监听进程错误
      editorProcess.on('error', (error) => {
        console.error('Editor process error:', error)
        // 进程启动失败时清理会话
        this.cleanupSession(sessionId)
      })

      // 监听进程退出 - 这是关键改进
      editorProcess.on('exit', async (code, signal) => {
        console.log(
          `Editor process exited for session ${sessionId}, code: ${code}, signal: ${signal}`
        )

        // 等待短暂时间让最后的文件保存操作完成
        setTimeout(async () => {
          try {
            const session = this.sessions.get(sessionId)
            if (session) {
              // 检查是否有未保存的修改
              if (session.isModified) {
                // 尝试最后一次同步
                console.log('Performing final sync before cleanup...')
                await this.uploadChanges(sessionId)
              }

              // 清理会话
              await this.cleanupSession(sessionId)
            }
          } catch (error) {
            console.error('Error during final cleanup:', error)
            // 即使出错也要清理会话
            await this.cleanupSession(sessionId)
          }
        }, 1000) // 等待1秒让文件保存操作完成
      })

      // 对于Windows记事本，需要特殊处理
      if (editorType === 'notepad') {
        // 记事本启动后立即分离，但我们仍然监听初始进程
        editorProcess.unref()
      }

      this.editorProcesses.set(sessionId, editorProcess)

      // 启动编辑器和文件监控
      this.startEditorAndFileMonitoring(sessionId)

      // 设置会话超时（作为备用清理机制）
      this.setSessionTimeout(sessionId, 60 * 60 * 1000) // 1小时超时，给用户更多时间

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '启动编辑器失败'
      }
    }
  }

  /**
   * 上传变更到远程
   */
  private async uploadChanges(
    sessionId: string,
    forceOverwrite = false
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return {
        success: false,
        error: '编辑会话不存在'
      }
    }

    try {
      session.status = 'SYNCING'
      this.emitStatusChange(session)

      // 检查远程文件是否被修改（冲突检测）
      if (!forceOverwrite) {
        const conflictExists = await this.checkForConflicts(session)
        if (conflictExists) {
          session.status = 'CONFLICT'
          this.emitStatusChange(session)
          return {
            success: false,
            error: '远程文件已被修改，存在冲突'
          }
        }
      }

      // 上传文件
      const result = await this.connectionManager.uploadFile(
        session.tempFilePath,
        session.remotePath
      )

      if (result.success) {
        session.status = 'EDITING'
        session.isModified = false
        session.lastSyncTime = new Date()

        // 更新远程文件基准时间
        const updatedRemoteInfo = await this.getRemoteFileInfo(session.remotePath)
        if (updatedRemoteInfo) {
          session.remoteBaseTime = updatedRemoteInfo.modified
        }

        this.emitStatusChange(session)
        return { success: true }
      } else {
        session.status = 'ERROR'
        session.error = result.error
        this.emitStatusChange(session)
        return {
          success: false,
          error: result.error || '上传失败'
        }
      }
    } catch (error) {
      session.status = 'ERROR'
      session.error = error instanceof Error ? error.message : '上传异常'
      this.emitStatusChange(session)
      return {
        success: false,
        error: session.error
      }
    }
  }

  /**
   * 获取远程文件信息
   */
  private async getRemoteFileInfo(remotePath: string): Promise<{ modified: Date } | null> {
    try {
      const result = await this.connectionManager.listDirectory(dirname(remotePath))
      if (result.success && result.files) {
        const remoteFile = result.files.find((file) => file.name === basename(remotePath))
        if (remoteFile) {
          return {
            modified: new Date(remoteFile.modified)
          }
        }
      }
      return null
    } catch (error) {
      console.error('Failed to get remote file info:', error)
      return null
    }
  }

  /**
   * 检查冲突
   */
  private async checkForConflicts(session: RemoteFileEditingSession): Promise<boolean> {
    try {
      // 获取远程文件列表来检查修改时间
      const result = await this.connectionManager.listDirectory(dirname(session.remotePath))
      if (result.success && result.files) {
        const remoteFile = result.files.find((file) => file.name === basename(session.remotePath))
        if (remoteFile) {
          const currentRemoteTime = new Date(remoteFile.modified)

          // 使用远程文件的基准时间进行比较，避免本地时间与远程时间不一致的问题
          if (session.remoteBaseTime) {
            // 添加2秒的容忍度，避免时间精度问题
            const tolerance = 2000 // 2秒
            return currentRemoteTime.getTime() > session.remoteBaseTime.getTime() + tolerance
          } else {
            // 如果没有基准时间，则无法检测冲突，假设无冲突
            console.warn('缺少远程文件基准时间，无法准确检测冲突')
            return false
          }
        }
      }
      return false
    } catch (error) {
      console.error('Failed to check conflicts:', error)
      // 检查失败时假设无冲突，让上传继续
      return false
    }
  }

  /**
   * 根据远程路径查找会话
   */
  private findSessionByRemotePath(remotePath: string): RemoteFileEditingSession | undefined {
    return Array.from(this.sessions.values()).find((session) => session.remotePath === remotePath)
  }

  /**
   * 发送状态变化事件
   */
  private emitStatusChange(session: RemoteFileEditingSession): void {
    // 确保只发送可序列化的属性
    const cleanSession: RemoteFileEditingSession = {
      id: session.id,
      remotePath: session.remotePath,
      tempFilePath: session.tempFilePath,
      status: session.status,
      lastModified: session.lastModified,
      isModified: session.isModified,
      startTime: session.startTime,
      ...(session.conflictResolution && { conflictResolution: session.conflictResolution }),
      ...(session.lastSyncTime && { lastSyncTime: session.lastSyncTime }),
      ...(session.remoteBaseTime && { remoteBaseTime: session.remoteBaseTime }),
      ...(session.error && { error: session.error })
    }
    this.emit('statusChange', cleanSession)
  }

  /**
   * 清理所有会话
   */
  public async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys())
    for (const sessionId of sessionIds) {
      await this.cleanupSession(sessionId)
    }
  }

  /**
   * 验证文件是否准备好（根据经验教训添加）
   */
  private async verifyFileReady(
    filePath: string,
    maxRetries = 3
  ): Promise<{ success: boolean; error?: string }> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 检查文件存在性
        const stats = await fs.stat(filePath)

        // 检查文件大小是否大于0（防止空文件）
        if (stats.size >= 0) {
          // 等待短暂时间确保文件系统操作完成
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { success: true }
        }
      } catch (error) {
        if (i === maxRetries - 1) {
          return {
            success: false,
            error: `文件验证失败: ${error instanceof Error ? error.message : '文件不可访问'}`
          }
        }
        // 重试前等待
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    return { success: false, error: '文件验证超时' }
  }

  /**
   * 设置会话超时
   */
  private setSessionTimeout(sessionId: string, timeoutMs = 30 * 60 * 1000): void {
    // 30分钟超时
    // 清除现有超时
    const existingTimeout = this.sessionTimeouts.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // 设置新超时
    const timeout = setTimeout(async () => {
      console.log(`Session ${sessionId} timed out, cleaning up...`)
      await this.cleanupSession(sessionId)
    }, timeoutMs)

    this.sessionTimeouts.set(sessionId, timeout)
  }

  /**
   * 清除会话超时
   */
  private clearSessionTimeout(sessionId: string): void {
    const timeout = this.sessionTimeouts.get(sessionId)
    if (timeout) {
      clearTimeout(timeout)
      this.sessionTimeouts.delete(sessionId)
    }
  }

  /**
   * 检测编辑器和文件状态，自动结束编辑
   */
  private startEditorAndFileMonitoring(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // 创建监控方法
    const monitorEditor = (): void => {
      this.checkEditorStatus(sessionId).catch((error) => {
        console.error('Error in editor monitoring:', error)
      })
    }

    // 启动定时检查
    const intervalId = setInterval(monitorEditor, 5000)

    // 存储间隔ID
    this.monitorIntervals.set(sessionId, intervalId)
  }

  /**
   * 检查编辑器状态
   */
  private async checkEditorStatus(sessionId: string): Promise<void> {
    const editorProcess = this.editorProcesses.get(sessionId)
    const currentSession = this.sessions.get(sessionId)

    if (!currentSession) {
      return
    }

    // 检查进程是否还在运行
    let processRunning = false
    if (editorProcess && !editorProcess.killed) {
      try {
        if (editorProcess.pid) {
          process.kill(editorProcess.pid, 0)
          processRunning = true
        }
      } catch {
        processRunning = false
      }
    }

    // 检查临时文件是否还存在
    let fileExists = false
    try {
      await fs.access(currentSession.tempFilePath)
      fileExists = true
    } catch {
      fileExists = false
    }

    // 如果进程不在运行且文件不存在，则结束编辑
    if (!processRunning && !fileExists) {
      console.log(`Editor and temp file gone for session ${sessionId}, cleaning up...`)
      const interval = this.monitorIntervals.get(sessionId)
      if (interval) {
        clearInterval(interval)
        this.monitorIntervals.delete(sessionId)
      }
      await this.cleanupSession(sessionId)
      return
    }

    // 如果只是进程不在运行但文件还在，等待一段时间再检查
    if (!processRunning && fileExists) {
      currentSession.lastModified = new Date()

      // 30秒后再检查一次
      setTimeout(async () => {
        try {
          const stillExists = await fs
            .access(currentSession.tempFilePath)
            .then(() => true)
            .catch(() => false)
          if (stillExists) {
            console.log(
              `Process ended but file still exists for session ${sessionId}, performing final sync...`
            )
            if (currentSession.isModified) {
              await this.uploadChanges(sessionId)
            }
            await this.cleanupSession(sessionId)
          }
        } catch {
          console.error('Error in delayed cleanup')
          await this.cleanupSession(sessionId)
        }
      }, 30000)
    }
  }
}
