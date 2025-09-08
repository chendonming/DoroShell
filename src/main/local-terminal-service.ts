import { IPty, spawn } from '@lydell/node-pty'
import { EventEmitter } from 'events'
import type { LocalTerminalOptions, LocalTerminalSession } from '../types'

// 跨平台默认shell获取函数
const getDefaultShell = (): string => {
  switch (process.platform) {
    case 'win32':
      return process.env.COMSPEC || 'cmd.exe'
    case 'darwin':
    case 'linux':
      return process.env.SHELL || '/bin/bash'
    default:
      return '/bin/sh'
  }
}

// 本地终端服务类
export class LocalTerminalService extends EventEmitter {
  private terminals: Map<string, { pty: IPty; session: LocalTerminalSession }> = new Map()
  private nextId = 1

  // 创建新的终端会话
  async createTerminal(options: LocalTerminalOptions): Promise<{
    success: boolean
    terminalId?: string
    error?: string
  }> {
    try {
      const terminalId = `local-terminal-${this.nextId++}`
      const shell = options.shell || getDefaultShell()

      // 创建 node-pty 进程
      const pty = spawn(shell, [], {
        cwd: options.cwd,
        cols: options.cols || 80,
        rows: options.rows || 24,
        env: process.env
      })

      // 创建会话对象
      const session: LocalTerminalSession = {
        id: terminalId,
        isActive: true,
        cwd: options.cwd
      }

      // 监听数据输出
      pty.onData((data: string) => {
        this.emit('data', terminalId, data)
      })

      // 监听进程退出
      pty.onExit(({ exitCode, signal }) => {
        try {
          this.terminals.delete(terminalId)
          // 确保 exitCode 是数字，如果是 undefined 则设为 -1
          const code = typeof exitCode === 'number' ? exitCode : -1
          this.emit('exit', terminalId, code)
        } catch (error) {
          console.error('Error handling terminal exit:', error)
        }
      })

      // 存储终端实例
      this.terminals.set(terminalId, { pty, session })

      return {
        success: true,
        terminalId
      }
    } catch (error) {
      console.error('Failed to create terminal:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建终端失败'
      }
    }
  }

  // 写入数据到指定终端
  async writeToTerminal(terminalId: string, data: string): Promise<void> {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) {
      throw new Error(`Terminal ${terminalId} not found`)
    }

    try {
      terminal.pty.write(data)
    } catch (error) {
      console.error(`Failed to write to terminal ${terminalId}:`, error)
      throw error
    }
  }

  // 调整终端大小
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) {
      throw new Error(`Terminal ${terminalId} not found`)
    }

    try {
      terminal.pty.resize(cols, rows)
    } catch (error) {
      console.error(`Failed to resize terminal ${terminalId}:`, error)
      throw error
    }
  }

  // 关闭指定终端
  async closeTerminal(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) {
      return // 终端已经不存在，认为关闭成功
    }

    try {
      terminal.session.isActive = false
      terminal.pty.kill()
      this.terminals.delete(terminalId)
    } catch (error) {
      console.error(`Failed to close terminal ${terminalId}:`, error)
      // 即使关闭失败也要从 Map 中移除
      this.terminals.delete(terminalId)
      throw error
    }
  }

  // 获取活跃终端列表
  getActiveTerminals(): LocalTerminalSession[] {
    return Array.from(this.terminals.values()).map((t) => t.session)
  }

  // 检查终端是否存在
  hasTerminal(terminalId: string): boolean {
    return this.terminals.has(terminalId)
  }

  // 清理所有终端（通常在应用关闭时调用）
  async cleanup(): Promise<void> {
    const terminalIds = Array.from(this.terminals.keys())

    for (const id of terminalIds) {
      try {
        await this.closeTerminal(id)
      } catch (error) {
        console.error(`Error cleaning up terminal ${id}:`, error)
      }
    }

    this.terminals.clear()
  }
}

// 创建单例实例
export const localTerminalService = new LocalTerminalService()
