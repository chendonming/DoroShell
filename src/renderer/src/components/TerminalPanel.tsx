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

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'monospace',
      fontSize: 14,
      convertEol: true
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
      term.dispose()
      termRef.current = null
    }
  }, [isOpen, connected])

  // connection is controlled externally; this panel only displays terminal

  if (!isOpen) return null

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {serverInfo || 'SSH 终端'}
          </span>
          <span className={`text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            {connected ? '已连接' : '未连接'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMaximize}
            title={isMaximized ? '还原' : '最大化'}
            className="px-2 py-1 rounded bg-transparent text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition transform"
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
            className="px-2 py-1 rounded bg-transparent text-gray-700 dark:text-white hover:bg-red-500 dark:hover:bg-red-600 hover:text-white active:scale-95 transition transform"
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
        className="relative flex-1 bg-black/90 text-white p-0 overflow-hidden"
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
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
            <div className="text-white text-sm">已断开 - 终端不可用</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TerminalPanel
