import React from 'react'
import TerminalPanel from './TerminalPanel'
import type { TerminalSession } from '../../../types'

interface MultiTerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  sessions: TerminalSession[]
  activeSessionId: string | null
  onSwitchSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onUpdateSession: (sessionId: string, updates: Partial<TerminalSession>) => void
  // SSH终端状态
  isConnected?: boolean
  currentServer?: string
}

const MultiTerminalPanel: React.FC<MultiTerminalPanelProps> = ({
  isOpen,
  onClose,
  isMaximized,
  onToggleMaximize,
  sessions,
  activeSessionId,
  onSwitchSession,
  onCloseSession,
  onUpdateSession
}) => {
  if (!isOpen || sessions.length === 0) {
    return null
  }

  const handleCloseSession = (sessionId: string, event: React.MouseEvent): void => {
    event.stopPropagation()
    onCloseSession(sessionId)
  }

  const handleClosePanel = (): void => {
    onClose()
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* 标签栏 */}
      <div className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* 终端标签 */}
        <div className="flex-1 flex items-center overflow-x-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`relative flex items-center px-3 py-2 border-r border-gray-200 dark:border-gray-700 cursor-pointer min-w-0 max-w-xs transition-colors ${
                session.id === activeSessionId
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => onSwitchSession(session.id)}
              title={session.title}
            >
              {/* 终端类型图标 */}
              <span className="flex-shrink-0 mr-2">{session.type === 'ssh' ? '🌐' : '💻'}</span>

              {/* 标题 */}
              <span className="truncate text-sm">
                {session.type === 'ssh' ? 'SSH' : '本地'}
                {session.type === 'ssh' && session.serverInfo ? ` - ${session.serverInfo}` : ''}
                {session.type === 'local' && session.cwd
                  ? ` - ${session.cwd.split(/[/\\]/).pop() || session.cwd}`
                  : ''}
              </span>

              {/* 连接状态指示器 */}
              <div
                className={`flex-shrink-0 ml-2 w-2 h-2 rounded-full ${
                  session.type === 'ssh'
                    ? session.isConnected
                      ? 'bg-green-500'
                      : 'bg-red-500'
                    : session.isActive
                      ? 'bg-green-500'
                      : 'bg-yellow-500'
                }`}
              />

              {/* 关闭按钮 */}
              <button
                className="flex-shrink-0 ml-2 w-4 h-4 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                onClick={(e) => handleCloseSession(session.id, e)}
                title="关闭终端"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  className="text-gray-500 dark:text-gray-400"
                >
                  <path
                    d="M1 1L7 7M7 1L1 7"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-1 px-2">
          <button
            onClick={onToggleMaximize}
            title={isMaximized ? '还原' : '最大化'}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {isMaximized ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="text-gray-600 dark:text-gray-400"
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="text-gray-600 dark:text-gray-400"
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
            onClick={handleClosePanel}
            title="关闭所有终端"
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className="text-red-600 dark:text-red-400"
            >
              <path
                d="M3 3L9 9M9 3L3 9"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 终端内容区域 */}
      <div className="flex-1 relative">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`absolute inset-0 ${session.id === activeSessionId ? 'block' : 'hidden'}`}
          >
            <TerminalPanel
              isOpen={true}
              onClose={() => {}} // 由标签控制关闭
              isMaximized={false} // 由外层控制
              onToggleMaximize={() => {}} // 由外层控制
              terminalType={session.type}
              localTerminalCwd={session.cwd}
              isConnected={session.type === 'ssh' ? (session.isConnected ?? false) : undefined}
              currentServer={session.type === 'ssh' ? session.serverInfo : undefined}
              sessionId={session.id}
              onSessionUpdate={(updates) => onUpdateSession(session.id, updates)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default MultiTerminalPanel
