import React, { useEffect, useState } from 'react'

type Props = {
  isConnected: boolean
  connectionStatus: string
  currentServer: string
  transfersCount: number
  isDarkMode: boolean
  onToggleDarkMode: () => void
  onOpenConnectionManager: () => void
  onShowTransfers: () => void
  onToggleTerminal: () => void
  onOpenCommandManager: () => void
  onDisconnect: () => void
}

const TitleBar: React.FC<Props> = ({
  isConnected,
  connectionStatus,
  currentServer,
  transfersCount,
  isDarkMode,
  onToggleDarkMode,
  onOpenConnectionManager,
  onShowTransfers,
  onToggleTerminal,
  onOpenCommandManager,
  onDisconnect
}) => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    try {
      if (window.api && window.api.windowControls) {
        window.api.windowControls
          .isMaximized()
          .then((v) => setIsMaximized(!!v))
          .catch(() => {})

        const cleanupMax = window.api.windowControls.on('maximize', () => setIsMaximized(true))
        const cleanupUnmax = window.api.windowControls.on('unmaximize', () => setIsMaximized(false))

        return () => {
          try {
            cleanupMax && cleanupMax()
            cleanupUnmax && cleanupUnmax()
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    return
  }, [])

  const minimize = (): void => {
    try {
      window.api.windowControls?.minimize()
    } catch {
      /* ignore */
    }
  }

  const toggleMaximize = async (): Promise<void> => {
    try {
      const max = await window.api.windowControls?.isMaximized()
      if (max) {
        await window.api.windowControls?.unmaximize()
      } else {
        await window.api.windowControls?.maximize()
      }
    } catch {
      /* ignore */
    }
  }

  const closeWindow = (): void => {
    try {
      window.api.windowControls?.close()
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 text-white p-2 shadow-lg relative titlebar">
        <div className="titlebar-left px-4 flex items-center">
          <h1 className="text-lg font-bold select-none">DoroShell</h1>
        </div>

        <div className="titlebar-controls px-4">
          <div className="flex items-center justify-end w-full gap-4">
            <div className="hidden sm:flex items-center space-x-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? 'bg-green-400 shadow-lg shadow-green-400/50'
                      : 'bg-red-400 shadow-lg shadow-red-400/50'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${isConnected ? 'text-green-100' : 'text-red-100'}`}
                >
                  {connectionStatus}
                </span>
                {currentServer && <span className="text-sm text-white/80">• {currentServer}</span>}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={onOpenConnectionManager}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2 titlebar-button"
                title="管理连接"
                aria-label="管理连接"
              >
                <span aria-hidden>🔌</span>
                <span className="ml-2 hidden sm:inline">连接</span>
              </button>

              <button
                onClick={onShowTransfers}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2 titlebar-button"
                title={transfersCount > 0 ? '显示传输' : '请先连接'}
                aria-label={transfersCount > 0 ? '显示传输' : '请先连接'}
              >
                <span aria-hidden>📥</span>
                <span className="ml-2 hidden sm:inline">
                  传输 {transfersCount > 0 && `(${transfersCount})`}
                </span>
              </button>

              <button
                onClick={onToggleTerminal}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2 titlebar-button"
                title="终端"
                aria-label="终端"
              >
                <span aria-hidden>🖥️</span>
                <span className="ml-2 hidden sm:inline">终端</span>
              </button>

              <button
                onClick={onOpenCommandManager}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2 titlebar-button"
                title="命令管理"
                aria-label="命令管理"
              >
                <span aria-hidden>📋</span>
                <span className="ml-2 hidden sm:inline">命令</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={onToggleDarkMode}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2 titlebar-button"
                title={isDarkMode ? '切换到浅色模式' : '切换到深色模式'}
                aria-label={isDarkMode ? '切换到浅色模式' : '切换到深色模式'}
                aria-pressed={isDarkMode}
              >
                <span aria-hidden>{isDarkMode ? '☀️' : '🌙'}</span>
                <span className="ml-2 hidden sm:inline">{isDarkMode ? '浅色' : '深色'}</span>
              </button>

              {isConnected && (
                <button
                  onClick={onDisconnect}
                  className="bg-red-500/80 hover:bg-red-600 text-white border border-red-400 px-3 py-2 rounded-md transition-colors duration-200 titlebar-button"
                  title="断开连接"
                  aria-label="断开连接"
                >
                  <span aria-hidden>⛔</span>
                  <span className="ml-2 hidden sm:inline">断开连接</span>
                </button>
              )}
            </div>

            {/* window controls (keep compact) */}
            <div className="flex items-center ml-4">
              <button className="titlebar-button" onClick={minimize} title="最小化">
                —
              </button>
              <button
                className="titlebar-button"
                onClick={toggleMaximize}
                title={isMaximized ? '还原' : '最大化'}
              >
                {isMaximized ? '🗗' : '🗖'}
              </button>
              <button className="titlebar-button close" onClick={closeWindow} title="关闭">
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default TitleBar
