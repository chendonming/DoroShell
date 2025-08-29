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

  // notify when connection is lost
  useEffect(() => {
    if (!connected) {
      notify('SSH 已断开', 'info')
    }
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
    term.open(containerRef.current)
    term.focus()
    termRef.current = term

    // load and attach fit addon for reliable fit behavior
    const fit = new FitAddon()
    try {
      term.loadAddon(fit)
      // perform initial fit
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore if addon fails */
    }

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
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        const dims = measureChar()
        if (dims) {
          try {
            term.resize(dims.cols, dims.rows)
          } catch {
            /* ignore */
          }
        }
      }
    })

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
      try {
        fit.fit()
        return
      } catch {
        const dims = measureChar()
        if (!dims) return
        try {
          term.resize(dims.cols, dims.rows)
        } catch {
          /* ignore resize errors */
        }
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
      try {
        fit.fit()
        return
      } catch {
        const dims = measureChar()
        if (!dims) return
        try {
          term.resize(dims.cols, dims.rows)
        } catch {
          /* ignore resize errors */
        }
      }
    })

    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      cleanup()
      ro.disconnect()
      mo.disconnect()
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
            // write locally so command is visible immediately
            try {
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
            // not connected -> just visually write command into local terminal
            try {
              term?.write(cmd)
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
