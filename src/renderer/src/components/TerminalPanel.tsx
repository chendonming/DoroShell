import React, { useEffect, useRef } from 'react'
import { notify } from '../utils/notifications'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ElectronAPI } from '../../../types'

interface TerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  isConnected?: boolean
  currentServer?: string
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
  isOpen,
  onClose,
  isMaximized,
  onToggleMaximize,
  isConnected,
  currentServer
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const lastSentRef = useRef<{ cmd: string; ts: number } | null>(null)
  const echoAccumRef = useRef<string>('')
  // connection state is provided by parent
  const connected = isConnected ?? false
  const serverInfo = currentServer ?? ''

  // only notify when connection transitions from connected -> disconnected
  const prevConnectedRef = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = prevConnectedRef.current
    // if previously connected and now not connected, notify
    if (prev === true && !connected) {
      notify('SSH 已断开', 'info')
    }
    // update previous state for next change
    prevConnectedRef.current = connected
  }, [connected])

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

    term.onData((data: string) => {
      // Only forward input to SSH when we know the connection is active
      if (connected && electronApi?.ssh?.send) {
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

  // listen for injection events from command manager — inject directly into terminal input
  useEffect(() => {
    const handler = (ev: Event): void => {
      try {
        const detail = (ev as CustomEvent).detail as { command?: string }
        const term = termRef.current
        const electronApi = (window as unknown as Window & { api?: ElectronAPI }).api
        if (detail && typeof detail.command === 'string') {
          const cmd = detail.command
          if (connected && electronApi?.ssh?.send) {
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
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-black/90 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {serverInfo || 'SSH 终端'}
          </span>
          <span
            className={`text-xs ${
              connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {connected ? '已连接' : '未连接'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMaximize}
            title={isMaximized ? '还原' : '最大化'}
            className="px-2 py-1 rounded bg-transparent text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300 dark:focus:ring-gray-600"
            aria-label={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? (
              // Windows-style Restore icon
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="3"
                  y="1"
                  width="8"
                  height="8"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="none"
                />
                <rect
                  x="1"
                  y="3"
                  width="8"
                  height="8"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="none"
                />
              </svg>
            ) : (
              // Windows-style Maximize icon
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="9"
                  height="9"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="none"
                />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            title="关闭"
            className="px-2 py-1 rounded bg-transparent text-gray-800 dark:text-white hover:bg-red-500 dark:hover:bg-red-600 hover:text-white active:scale-95 transition transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-300 dark:focus:ring-red-600"
            aria-label="关闭终端"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="block"
            >
              <path
                d="M3 3L9 9M9 3L3 9"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 bg-white text-gray-900 dark:bg-black/90 dark:text-white p-0 overflow-hidden shadow-sm border border-gray-200 dark:border-transparent"
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
    </div>
  )
}

export default TerminalPanel
