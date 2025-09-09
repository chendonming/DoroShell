import React, { useEffect, useRef, useState } from 'react'
import { notify } from '../utils/notifications'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ElectronAPI, TerminalSession } from '../../../types'
import ContextMenu from './ContextMenu'
import { useConfirm } from '../hooks/useConfirm'

interface TerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  isConnected?: boolean
  currentServer?: string
  // 终端类型和本地终端配置
  terminalType?: 'ssh' | 'local'
  localTerminalCwd?: string
  // 新增：会话管理相关
  sessionId?: string
  onSessionUpdate?: (updates: Partial<TerminalSession>) => void
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
  isOpen,
  isConnected,
  terminalType = 'ssh',
  localTerminalCwd,
  onSessionUpdate
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const lastSentRef = useRef<{ cmd: string; ts: number } | null>(null)
  const echoAccumRef = useRef<string>('')

  // 本地终端相关状态
  const [localTerminalId, setLocalTerminalId] = React.useState<string | null>(null)
  const [localTerminalActive, setLocalTerminalActive] = React.useState(false)

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
  }>({ visible: false, x: 0, y: 0 })

  // 确认对话框钩子
  const confirm = useConfirm()

  // connection state is provided by parent
  const connected = terminalType === 'local' ? localTerminalActive : (isConnected ?? false)

  // 处理复制操作
  const handleCopy = async (): Promise<void> => {
    try {
      const term = termRef.current
      if (!term) {
        notify('终端未初始化', 'error')
        return
      }

      // 检查是否有选中的文字
      if (!term.hasSelection()) {
        notify('没有选中的文字', 'info')
        return
      }

      // 获取选中的文字
      const selectedText = term.getSelection()
      if (!selectedText) {
        notify('未获取到选中的文字', 'info')
        return
      }

      // 复制到剪贴板
      await navigator.clipboard.writeText(selectedText)
      notify('复制成功', 'success')

      // 聚焦终端
      term.focus()
    } catch (error) {
      console.error('复制失败:', error)
      notify('复制失败：无法访问剪贴板', 'error')
    }
  }

  // 处理粘贴操作
  const handlePaste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        notify('剪贴板为空', 'info')
        return
      }

      // 检查是否为多行文字
      const lines = text.split(/\r?\n/)
      if (lines.length > 1) {
        // 多行文字，显示确认对话框
        const shouldPaste = await confirm({
          title: '确认粘贴',
          message: `您要粘贴的内容包含 ${lines.length} 行文字。是否继续？`,
          confirmText: '粘贴',
          cancelText: '取消'
        })

        if (!shouldPaste) {
          return
        }
      }

      // 执行粘贴操作
      const term = termRef.current
      if (term && (connected || (terminalType === 'local' && localTerminalActive))) {
        if (terminalType === 'local' && localTerminalId && localTerminalActive) {
          // 本地终端粘贴（只发送到后端，不在本地显示）
          const electronApi = (window as unknown as Window & { api?: ElectronAPI }).api
          electronApi?.localTerminal?.writeToTerminal(localTerminalId, text)
        } else if (terminalType === 'ssh' && connected) {
          // SSH终端粘贴（只发送到后端，不在本地显示）
          const electronApi = (window as unknown as Window & { api?: ElectronAPI }).api
          electronApi?.ssh?.send(text)
        }

        // 聚焦终端
        term.focus()

        notify('粘贴成功', 'success')
      } else {
        notify('终端未连接，无法粘贴', 'error')
      }
    } catch (error) {
      console.error('粘贴失败:', error)
      notify('粘贴失败：无法访问剪贴板', 'error')
    }
  }

  // 处理右键菜单
  const handleContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault()

    // 获取当前鼠标位置（重要：使用当前操作时的鼠标位置）
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY
    })
  }

  // 关闭右键菜单
  const closeContextMenu = (): void => {
    setContextMenu({ visible: false, x: 0, y: 0 })
  }

  // 右键菜单项目（在菜单显示时动态计算）
  const getContextMenuItems = (): Array<{
    label: string
    icon: string
    action: () => Promise<void>
    disabled: boolean
    disabledReason?: string
  }> => {
    const term = termRef.current
    const hasSelection = term ? term.hasSelection() : false

    return [
      {
        label: '复制',
        icon: '📋',
        action: handleCopy,
        disabled: !hasSelection,
        disabledReason: hasSelection ? undefined : '没有选中的文字'
      },
      {
        label: '粘贴',
        icon: '📋',
        action: handlePaste,
        disabled: terminalType === 'local' ? !localTerminalActive : !connected,
        disabledReason: (terminalType === 'local' ? !localTerminalActive : !connected)
          ? '终端未连接'
          : undefined
      }
    ]
  }

  // only notify when SSH connection transitions from connected -> disconnected
  const prevConnectedRef = useRef<boolean | null>(null)
  useEffect(() => {
    // 只对SSH终端进行连接状态通知，本地终端不需要
    if (terminalType !== 'ssh') {
      return
    }

    const prev = prevConnectedRef.current
    // if previously connected and now not connected, notify
    if (prev === true && !connected) {
      notify('SSH 已断开', 'info')
    }
    // update previous state for next change
    prevConnectedRef.current = connected
  }, [connected, terminalType])

  useEffect(() => {
    if (!isOpen) return
    if (!containerRef.current) return

    // track whether we've already triggered a data-driven resize
    let didDataResize = false

    // define light/dark theme palettes for xterm
    const xtermLightTheme = {
      background: '#ffffff',
      foreground: '#111827',
      cursor: '#111827',
      black: '#000000',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0891b2',
      white: '#ffffff',
      brightBlack: '#6b7280',
      brightWhite: '#f9fafb'
    }

    const xtermDarkTheme = {
      background: '#0b1220',
      foreground: '#e6edf3',
      cursor: '#e6edf3',
      black: '#0b1220',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#67e8f9',
      white: '#cbd5e1',
      brightBlack: '#334155',
      brightWhite: '#f8fafc'
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'monospace',
      fontSize: 14,
      convertEol: true,
      // 启用文字选择功能
      allowProposedApi: true,
      theme: document.documentElement.classList.contains('dark') ? xtermDarkTheme : xtermLightTheme
    })
    // 提前声明 fit/webgl 引用，避免在使用前重复声明
    type FitAddonLike = { fit?: () => void }
    type WebglLike = { activate?: (t: Terminal) => void; dispose?: () => void }

    let fit: FitAddon | null = null
    let webgl: WebglLike | null = null

    term.open(containerRef.current)
    // 立即创建并加载 FitAddon，确保初始渲染阶段能精确计算 cols/rows
    try {
      fit = new FitAddon()
      term.loadAddon(fit)
      // 初始fit操作延迟到terminal完全准备好
      // 不在这里立即调用fit，而是依赖后续的requestAnimationFrame调用
    } catch {
      fit = null
    }
    // ensure the terminal's top-level element fills the container
    try {
      const tEl = term.element as HTMLElement | null
      if (tEl) {
        tEl.style.position = 'absolute'
        tEl.style.inset = '0'
        tEl.style.width = '100%'
        tEl.style.height = '100%'
      }
    } catch {
      /* ignore styling errors */
    }
    term.focus()
    termRef.current = term

    // 安全的fit调用函数，确保terminal已完全初始化
    const safeFit = (fitAddon: unknown): boolean => {
      try {
        // 基本检查：terminal和容器是否存在
        const container = containerRef.current
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
          return false
        }

        // 检查terminal基本状态
        if (!term || !term.element) {
          return false
        }

        // 检查terminal是否已经open并有有效的rows/cols
        if (term.rows <= 0 || term.cols <= 0) {
          return false
        }

        // 直接尝试fit，依赖try-catch捕获任何内部错误
        if (fitAddon && typeof (fitAddon as FitAddonLike).fit === 'function') {
          ;(fitAddon as FitAddonLike).fit!()
        }
        return true
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('FitAddon fit() failed:', error)
        }
        return false
      }
    }

    // 带重试的延迟fit函数
    const delayedFitWithRetry = (fitAddon: unknown, maxRetries = 5, delay = 200): void => {
      let retryCount = 0
      const tryFit = (): void => {
        if (safeFit(fitAddon)) {
          updateWebglCanvas()
          requestAnimationFrame(() => {
            updateWebglCanvas()
            try {
              term.refresh(0, term.rows - 1)
            } catch {
              /* ignore refresh errors */
            }
          })
          return
        }

        retryCount++
        if (retryCount < maxRetries) {
          // 使用更长的延迟，递增策略
          setTimeout(tryFit, delay * retryCount) // 200ms, 400ms, 600ms, 800ms, 1000ms
        } else {
          // 重试失败，使用手动尺寸计算
          const dims = measureChar()
          if (dims) {
            try {
              term.resize(dims.cols, dims.rows)
              updateWebglCanvas()
              requestAnimationFrame(() => {
                updateWebglCanvas()
                try {
                  term.refresh(0, term.rows - 1)
                } catch {
                  /* ignore refresh errors */
                }
              })
            } catch {
              /* ignore resize errors */
            }
          }
        }
      }

      // 立即尝试一次，失败后启动重试
      tryFit()
    } // 优先使用 WebGL 渲染；同时预加载 FitAddon 用于精确的 cols/rows 计算和回退

    // 更新 WebGL canvas 的 CSS 和 backing buffer（按 devicePixelRatio）
    // 作用：确保 canvas 的视觉区域与父容器尺寸一致，避免因像素缓冲未更新而产生恒定留白
    const updateWebglCanvas = (): void => {
      try {
        const container = containerRef.current
        if (!container) return
        const canvas = container.querySelector('canvas') as HTMLCanvasElement | null
        if (!canvas) return
        // 使用像素值精确设置 canvas 大小，避免百分比计算或父层样式干扰
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        canvas.style.width = `${container.clientWidth}px`
        canvas.style.height = `${container.clientHeight}px`
        canvas.style.display = 'block'
        // 清除可能的 transform/padding/margin，防止渲染位移或裁切
        canvas.style.transform = 'none'
        canvas.style.margin = '0'
        canvas.style.padding = '0'
        // 将 drawing buffer 大小调整为 CSS 尺寸 * DPR，避免高 DPI 下渲染只占据部分像素
        const dpr = window.devicePixelRatio || 1
        const w = Math.max(1, Math.floor(container.clientWidth * dpr))
        const h = Math.max(1, Math.floor(container.clientHeight * dpr))
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
      } catch {
        /* 忽略错误 */
      }
    }

    // 先尝试动态加载 WebGL addon，若失败回退（FitAddon 已由后续逻辑处理）
    ;(async () => {
      try {
        // dynamic import with vite-ignore so bundler won't fail if the package isn't installed
        const mod = await import(/* @vite-ignore */ '@xterm/addon-webgl')
        const Webgl = mod?.default ?? mod?.WebglAddon ?? mod
        webgl = new Webgl({ preserveDrawingBuffer: false })
        // activate will throw if WebGL context can't be created
        if (webgl && typeof webgl.activate === 'function') {
          webgl.activate(term)
        }

        // 激活后让 FitAddon 先计算 cols/rows（若已加载），再更新 canvas backing buffer
        if (fit) {
          // WebGL激活后使用延迟fit确保稳定
          setTimeout(() => delayedFitWithRetry(fit), 100)
        }
        // 调整 canvas 样式与像素缓冲
        updateWebglCanvas()
        // 再下一帧确保布局稳定后再次调整
        requestAnimationFrame(updateWebglCanvas)
      } catch {
        // WebGL 不可用或未安装：不做额外处理，已有的 fit 回退逻辑会在后续执行
      }
    })()

    // measurement helper (placed before it's used)
    const measureChar = (): { cols: number; rows: number } | null => {
      const container = containerRef.current
      const measure = measureRef.current
      if (!container || !measure) return null

      const charRect = measure.getBoundingClientRect()
      const charWidth = charRect.width
      const charHeight = charRect.height
      if (charWidth <= 0 || charHeight <= 0) return null

      const cols = Math.max(1, Math.floor(container.clientWidth / charWidth))
      const rows = Math.max(1, Math.floor(container.clientHeight / charHeight))
      return { cols, rows }
    }

    // initial resize / fit after open — ensures term internal layout is ready
    // 使用延迟初始化确保terminal完全准备好
    setTimeout(() => {
      if (fit) {
        delayedFitWithRetry(fit)
      } else {
        const dims = measureChar()
        if (dims) {
          try {
            term.resize(dims.cols, dims.rows)
            updateWebglCanvas()
            requestAnimationFrame(() => {
              updateWebglCanvas()
              try {
                term.refresh(0, term.rows - 1)
              } catch {
                /* ignore refresh errors */
              }
            })
          } catch {
            /* ignore */
          }
        }
      }
    }, 150) // 给terminal更多时间完全初始化

    // subscribe to ssh data from preload
    const electronApi = (window as unknown as Window & { api?: ElectronAPI }).api

    // watch for theme changes (document.documentElement.classList toggling 'dark')
    const mo = new MutationObserver(() => {
      try {
        const useDark = document.documentElement.classList.contains('dark')
        const tAny = term as unknown as {
          setOption?: (key: string, value: unknown) => void
          options?: { theme?: unknown }
        }
        if (typeof tAny.setOption === 'function') {
          tAny.setOption('theme', useDark ? xtermDarkTheme : xtermLightTheme)
        } else if (tAny.options) {
          tAny.options.theme = useDark ? xtermDarkTheme : xtermLightTheme
        }
      } catch {
        /* ignore */
      }
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const ensureFitAndResize = (): void => {
      // if we have fit addon, use it; otherwise WebGL will handle resizing internally
      if (fit) {
        const fitSuccessful = safeFit(fit)
        if (fitSuccessful) {
          // 确保 WebGL canvas 同步更新
          updateWebglCanvas()
          return
        }
        // fit失败，fallback to manual
      }
      const dims = measureChar()
      if (!dims) return
      try {
        term.resize(dims.cols, dims.rows)
        // 手动resize后也要更新WebGL canvas
        updateWebglCanvas()
      } catch {
        /* ignore resize errors */
      }
    }

    const cleanup = electronApi?.ssh?.onData
      ? electronApi.ssh.onData((d: string) => {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[ssh:data preview]', d.slice(0, 200))
          }

          // If we recently sent characters from an injected command, try to suppress the echoed characters.
          try {
            const last = lastSentRef.current
            if (last && Date.now() - last.ts < 1500) {
              // normalize incoming and remove CR
              const incoming = d.replace(/\r/g, '')
              // accumulate
              echoAccumRef.current += incoming
              // If accumulated echo is still a prefix of the sent command, keep suppressing
              if (last.cmd.startsWith(echoAccumRef.current)) {
                return
              }
              // If the accumulated contains the full sent command, remove the echoed part and write the rest
              const idx = echoAccumRef.current.indexOf(last.cmd)
              if (idx >= 0) {
                const after = echoAccumRef.current.slice(idx + last.cmd.length)
                if (after) term.write(after)
                lastSentRef.current = null
                echoAccumRef.current = ''
                return
              }
              // otherwise, fallthrough and write incoming normally
            }
          } catch {
            // ignore safety checks
          }

          // write incoming data
          term.write(d)

          // ensure layout after data arrives; try immediately and again on next frame
          try {
            ensureFitAndResize()
          } catch {
            /* ignore */
          }
          requestAnimationFrame(() => {
            try {
              ensureFitAndResize()
            } catch {
              /* ignore */
            }
          })
        })
      : () => {}

    // 本地终端数据处理
    const localTerminalCleanup = electronApi?.localTerminal?.onTerminalData
      ? electronApi.localTerminal.onTerminalData((termId: string, data: string) => {
          if (termId === localTerminalId) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('[local-terminal:data preview]', termId, data.slice(0, 100))
            }
            term.write(data)

            // ensure layout after data arrives
            try {
              ensureFitAndResize()
            } catch {
              /* ignore */
            }
            requestAnimationFrame(() => {
              try {
                ensureFitAndResize()
              } catch {
                /* ignore */
              }
            })
          }
        })
      : () => {}

    // 本地终端退出处理
    const localTerminalExitCleanup = electronApi?.localTerminal?.onTerminalExit
      ? electronApi.localTerminal.onTerminalExit((termId: string, exitCode: number) => {
          if (termId === localTerminalId) {
            console.log(`本地终端 ${termId} 已退出，退出码: ${exitCode}`)
            setLocalTerminalActive(false)
            setLocalTerminalId(null)
            term.write(`\r\n\x1b[31m终端已退出 (退出码: ${exitCode})\x1b[0m\r\n`)
          }
        })
      : () => {}

    term.onData((data: string) => {
      // 根据终端类型路由数据
      if (terminalType === 'local' && localTerminalId && localTerminalActive) {
        // 发送到本地终端
        electronApi?.localTerminal?.writeToTerminal(localTerminalId, data)
      } else if (terminalType === 'ssh' && connected && electronApi?.ssh?.send) {
        // 发送到SSH终端
        electronApi.ssh.send(data)
      }

      if (!didDataResize) {
        didDataResize = true
        // recalc resize once data starts flowing
        const dims = measureChar()
        if (dims) {
          try {
            term.resize(dims.cols, dims.rows)
          } catch {
            /* ignore */
          }
        }
        // ensure one more fit on next frame
        requestAnimationFrame(() => {
          try {
            ensureFitAndResize()
          } catch {
            /* ignore */
          }
        })
      }
    })

    const ro = new ResizeObserver(() => {
      // 使用一个短暂的延迟确保DOM完全更新后再执行resize
      requestAnimationFrame(() => {
        if (fit) {
          const fitSuccessful = safeFit(fit)
          if (fitSuccessful) {
            // Fit 后必须同步 WebGL canvas backing buffer
            updateWebglCanvas()
            // 再下一帧确保布局完全稳定
            requestAnimationFrame(updateWebglCanvas)
          } else {
            // fall through to manual sizing below
            const dims = measureChar()
            if (dims) {
              try {
                term.resize(dims.cols, dims.rows)
                updateWebglCanvas()
                requestAnimationFrame(updateWebglCanvas)
              } catch {
                /* ignore resize errors */
              }
            }
          }
        } else {
          const dims = measureChar()
          if (dims) {
            try {
              term.resize(dims.cols, dims.rows)
              updateWebglCanvas()
              requestAnimationFrame(updateWebglCanvas)
            } catch {
              /* ignore resize errors */
            }
          }
        }
      })
    })

    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      cleanup()
      localTerminalCleanup()
      localTerminalExitCleanup()
      ro.disconnect()
      mo.disconnect()
      try {
        if (webgl && typeof webgl.dispose === 'function') {
          webgl.dispose()
        }
      } catch {
        /* ignore */
      }
      term.dispose()
      termRef.current = null
    }
  }, [isOpen, connected])

  // 本地终端初始化
  useEffect(() => {
    if (terminalType === 'local' && isOpen && localTerminalCwd && !localTerminalId) {
      // 创建本地终端
      const initLocalTerminal = async (): Promise<void> => {
        try {
          const result = await window.api.localTerminal?.createTerminal({
            cwd: localTerminalCwd,
            cols: 80,
            rows: 24
          })

          if (result?.success && result.terminalId) {
            setLocalTerminalId(result.terminalId)
            setLocalTerminalActive(true)
            console.log('本地终端创建成功:', result.terminalId)

            // 更新会话状态
            if (onSessionUpdate) {
              onSessionUpdate({
                isActive: true,
                localTerminalId: result.terminalId
              })
            }
          } else {
            console.error('创建本地终端失败:', result?.error)
            notify('创建本地终端失败: ' + (result?.error || '未知错误'), 'error')

            // 更新会话状态为失败
            if (onSessionUpdate) {
              onSessionUpdate({ isActive: false })
            }
          }
        } catch (error) {
          console.error('创建本地终端异常:', error)
          notify('创建本地终端异常', 'error')

          if (onSessionUpdate) {
            onSessionUpdate({ isActive: false })
          }
        }
      }

      initLocalTerminal()
    }

    // 清理本地终端
    return () => {
      if (localTerminalId && terminalType === 'local') {
        window.api.localTerminal?.closeTerminal(localTerminalId).catch(console.error)
        setLocalTerminalId(null)
        setLocalTerminalActive(false)

        if (onSessionUpdate) {
          onSessionUpdate({ isActive: false, localTerminalId: undefined })
        }
      }
    }
  }, [terminalType, isOpen, localTerminalCwd, localTerminalId]) // 移除 onSessionUpdate 依赖，避免不必要的重新创建

  // listen for injection events from command manager — inject directly into terminal input
  useEffect(() => {
    const handler = (ev: Event): void => {
      try {
        const detail = (ev as CustomEvent).detail as { command?: string }
        const term = termRef.current
        const electronApi = (window as unknown as Window & { api?: ElectronAPI }).api
        if (detail && typeof detail.command === 'string') {
          const cmd = detail.command
          if (terminalType === 'local' && localTerminalId && localTerminalActive) {
            // 本地终端命令注入
            try {
              term?.write(cmd)
              // 直接发送命令字符到本地终端
              for (const ch of cmd) {
                try {
                  electronApi?.localTerminal?.writeToTerminal(localTerminalId, ch)
                } catch {
                  // ignore per-char send errors
                }
              }
              term?.focus()
            } catch {
              /* ignore */
            }
          } else if (terminalType === 'ssh' && connected && electronApi?.ssh?.send) {
            // SSH终端命令注入(原有逻辑)
            // prepare to accumulate remote echo and suppress it
            echoAccumRef.current = ''
            lastSentRef.current = { cmd, ts: Date.now() }
            // clear current input line then write locally so command is visible immediately
            try {
              // ESC[2K clears the entire line, \r returns carriage to start
              term?.write(cmd)
            } catch {
              /* ignore */
            }
            // send characters to remote without newline so user can press Enter to execute
            for (const ch of cmd) {
              try {
                electronApi.ssh.send(ch)
              } catch {
                // ignore per-char send errors
              }
            }
            // ensure terminal has focus so user can press Enter immediately
            try {
              term?.focus()
            } catch {
              /* ignore */
            }
            // fallback to clear markers after a short time
            setTimeout(() => {
              try {
                if (lastSentRef.current && Date.now() - lastSentRef.current.ts > 1500) {
                  lastSentRef.current = null
                  echoAccumRef.current = ''
                }
              } catch {
                // ignore
              }
            }, 1500)
          } else {
            // not connected -> clear line then visually write command into local terminal
            try {
              term?.write('\x1b[2K\r' + cmd)
              // focus terminal so user can press Enter to execute locally
              try {
                term?.focus()
              } catch {
                /* ignore */
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('doro:injectCommand', handler as EventListener)
    return () => window.removeEventListener('doro:injectCommand', handler as EventListener)
  }, [connected])

  // overlay removed — injections now write directly into terminal

  // connection is controlled externally; this panel only displays terminal

  if (!isOpen) return null

  return (
    <div className="h-full w-full flex flex-col">
      {/* 直接显示终端内容，标题栏由 MultiTerminalPanel 管理 */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-white text-gray-900 dark:bg-black/90 dark:text-white p-0 overflow-hidden shadow-sm border border-gray-200 dark:border-transparent"
        onContextMenu={handleContextMenu}
      >
        {/* hidden element used to measure character size — placed inside container to inherit sizing */}
        <div
          ref={measureRef}
          style={{
            position: 'absolute',
            visibility: 'hidden',
            fontFamily: 'monospace',
            fontSize: 14
          }}
        >
          W
        </div>
        {/* overlay shown when disconnected to prevent input */}
        {!connected && (
          <div className="absolute inset-0 bg-white/80 dark:bg-black/80 flex items-center justify-center pointer-events-auto">
            <div className="text-gray-900 dark:text-white text-sm">已断开 - 终端不可用</div>
          </div>
        )}

        {/* direct injection — overlay removed */}
      </div>

      {/* 右键上下文菜单 */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getContextMenuItems()}
        onClose={closeContextMenu}
      />
    </div>
  )
}

export default TerminalPanel
