import React, { useState, useEffect, useRef } from 'react'
import ConnectionManager from './ConnectionManager'
import LocalFileExplorer from './LocalFileExplorer'
import RemoteFileExplorer, { type RemoteFileExplorerRef } from './RemoteFileExplorer'
import FileTransfer from './FileTransfer'
import Modal from './Modal'
import TerminalPanel from './TerminalPanel'
import type { FTPCredentials, TransferItem, TransferProgress } from '../../../types'

const FTPManager: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('未连接')
  const [currentServer, setCurrentServer] = useState<string>('')
  const [transfers, setTransfers] = useState<TransferItem[]>([])
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showConnectionManager, setShowConnectionManager] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState<number>(240)
  const draggingRef = useRef(false)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const container = document.getElementById('main-split-container')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newHeight = Math.max(100, rect.bottom - e.clientY)
      setTerminalHeight(newHeight)
    }

    const onMouseUp = (): void => {
      draggingRef.current = false
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
  const [localCurrentPath, setLocalCurrentPath] = useState<string>('')
  const remoteFileExplorerRef = useRef<RemoteFileExplorerRef>(null)

  // 防止在未连接时误触发后在连接后自动弹出 modal：
  // 任何连接状态变化时都关闭传输 modal，用户可在连接后手动打开
  useEffect(() => {
    setShowTransferModal(false)
  }, [isConnected])
  useEffect(() => {
    // 检查并设置初始主题
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark)

    setIsDarkMode(shouldBeDark)
    updateTheme(shouldBeDark)

    // 检查连接状态
    checkConnectionStatus()

    // 设置传输进度监听
    const cleanup = window.api.ftp.onTransferProgress(handleTransferProgress)

    return cleanup
  }, [])

  const updateTheme = (dark: boolean): void => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }

  const toggleDarkMode = (): void => {
    const newDarkMode = !isDarkMode
    setIsDarkMode(newDarkMode)
    updateTheme(newDarkMode)
  }

  const checkConnectionStatus = async (): Promise<void> => {
    try {
      const status = await window.api.ftp.getConnectionStatus()
      const connected = status?.connected ?? false
      setIsConnected(connected)

      if (connected) {
        const credentials = await window.api.ftp.getCurrentCredentials()
        if (credentials) {
          setCurrentServer(`${credentials.username}@${credentials.host}`)
          setConnectionStatus('已连接')
        } else {
          setCurrentServer('')
          setConnectionStatus('已连接')
        }
      } else {
        setCurrentServer('')
        setConnectionStatus('未连接')
      }
    } catch (error) {
      console.error('Failed to check connection status:', error)
      setConnectionStatus('连接状态检查失败')
    }
  }

  const handleConnect = async (credentials: FTPCredentials): Promise<void> => {
    setConnectionStatus('正在连接...')

    try {
      const result = await window.api.ftp.connect(credentials)

      if (result.success) {
        setIsConnected(true)
        // refresh current credentials from backend to ensure canonical source
        try {
          const creds = await window.api.ftp.getCurrentCredentials()
          if (creds) setCurrentServer(`${creds.username}@${creds.host}`)
          else setCurrentServer(`${credentials.username}@${credentials.host}`)
        } catch {
          setCurrentServer(`${credentials.username}@${credentials.host}`)
        }
        setConnectionStatus('已连接')
      } else {
        setIsConnected(false)
        setConnectionStatus(result.error || '连接失败')
      }
    } catch (error) {
      console.error('Connection error:', error)
      setIsConnected(false)
      setConnectionStatus('连接失败')
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    try {
      await window.api.ftp.disconnect()
      setIsConnected(false)
      setCurrentServer('')
      setConnectionStatus('已断开连接')
      // surface a notification for disconnect
      try {
        // lazy import notify to avoid circular deps
        const { notify } = await import('../utils/notifications')
        notify('已断开连接', 'info')
      } catch {
        // ignore
      }
      setTransfers([])
    } catch (error) {
      console.error('Disconnect error:', error)
      setConnectionStatus('Disconnect failed')
    }
  }

  const handleTransferProgress = (progress: TransferProgress): void => {
    setTransfers((prev) => {
      const existingIndex = prev.findIndex((t) => t.id === progress.transferId)

      if (existingIndex >= 0) {
        // 更新现有传输
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          progress: progress.progress,
          status: progress.status
        }
        return updated
      } else {
        // 创建新的传输项
        const newTransfer: TransferItem = {
          id: progress.transferId,
          filename: 'Unknown', // 这里需要从其他地方获取文件名
          type: progress.status === 'uploading' ? 'upload' : 'download',
          progress: progress.progress,
          status: progress.status,
          size: 0,
          localPath: '',
          remotePath: ''
        }
        return [...prev, newTransfer]
      }
    })
  }

  // 专门用于远程文件下载的传输函数，使用本地当前路径作为下载位置
  const addRemoteTransfer = async (
    transfer: Omit<TransferItem, 'id' | 'progress' | 'status' | 'localPath'> & {
      draggedFile?: File
    }
  ): Promise<void> => {
    if (transfer.type === 'upload' && transfer.draggedFile) {
      // 处理拖拽上传的文件
      const fullTransfer = {
        ...transfer,
        localPath: `[DRAGGED_FILE]${transfer.draggedFile.name}`,
        draggedFile: transfer.draggedFile
      }
      await addTransfer(fullTransfer)
    } else if (transfer.type === 'download') {
      // 处理下载
      if (!localCurrentPath) {
        console.error('本地路径未设置，无法下载')
        return
      }

      const localPath = await window.api.path.joinPath(localCurrentPath, transfer.filename)
      const fullTransfer = {
        ...transfer,
        localPath
      }
      await addTransfer(fullTransfer)
    }
  }

  const addTransfer = async (
    transfer: Omit<TransferItem, 'id' | 'progress' | 'status'>
  ): Promise<void> => {
    const newTransfer: TransferItem = {
      ...transfer,
      id: Math.random().toString(36).substr(2, 9),
      progress: 0,
      status: 'pending'
    }

    setTransfers((prev) => [...prev, newTransfer])

    // 立即开始下载
    try {
      if (transfer.type === 'download') {
        console.log('[Renderer] FTPManager start download ->', {
          localPath: transfer.localPath,
          remotePath: transfer.remotePath
        })
        const result = await window.api.ftp.downloadFile(
          transfer.remotePath,
          transfer.localPath,
          newTransfer.id
        )

        if (result.success) {
          console.log('[Renderer] FTPManager download success ->', { id: newTransfer.id, result })
          // 下载成功，更新状态为完成
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === newTransfer.id ? { ...t, status: 'completed', progress: 100 } : t
            )
          )
        } else {
          console.error('[Renderer] FTPManager download failed ->', { id: newTransfer.id, result })
          // 下载失败
          setTransfers((prev) =>
            prev.map((t) => (t.id === newTransfer.id ? { ...t, status: 'failed' } : t))
          )
        }
      } else if (transfer.type === 'upload') {
        console.log('[Renderer] FTPManager start upload ->', {
          localPath: transfer.localPath,
          remotePath: transfer.remotePath,
          dragged: !!transfer.draggedFile
        })
        let result: { success: boolean; error?: string }

        if (transfer.draggedFile) {
          // 处理拖拽上传的文件
          const fileBuffer = await transfer.draggedFile.arrayBuffer()
          result = await window.api.ftp.uploadDraggedFile(
            fileBuffer,
            transfer.draggedFile.name,
            transfer.remotePath
          )
        } else {
          // 处理常规文件上传
          result = await window.api.ftp.uploadFile(transfer.localPath, transfer.remotePath)
        }

        if (result.success) {
          console.log('[Renderer] FTPManager upload success ->', { id: newTransfer.id, result })
          // 上传成功
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === newTransfer.id ? { ...t, status: 'completed', progress: 100 } : t
            )
          )
          // 上传成功后刷新远程文件列表
          if (remoteFileExplorerRef.current) {
            await remoteFileExplorerRef.current.refresh()
          }
        } else {
          console.error('[Renderer] FTPManager upload failed ->', { id: newTransfer.id, result })
          // 上传失败
          setTransfers((prev) =>
            prev.map((t) => (t.id === newTransfer.id ? { ...t, status: 'failed' } : t))
          )
        }
      }
    } catch (error) {
      console.error('Transfer failed:', error)
      // 更新转移状态为失败
      setTransfers((prev) =>
        prev.map((t) => (t.id === newTransfer.id ? { ...t, status: 'failed' } : t))
      )
    }
  }

  const removeTransfer = (id: string): void => {
    setTransfers((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-gray-900">
      {/* Header Toolbar */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 text-white p-4 shadow-lg relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">DoroShell</h1>

            {/* Toolbar Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowConnectionManager(true)}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2"
                title="管理连接"
              >
                🔌 连接
              </button>
              <button
                onClick={() => {
                  if (isConnected) {
                    setShowTransferModal(true)
                  } else {
                    // 如果未连接，打开连接管理
                    setShowConnectionManager(true)
                  }
                }}
                className={`bg-white/20 border-white/30 hover:bg-white/30 text-white border px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2`}
                title={isConnected ? '显示传输' : '请先连接'}
              >
                📥 传输 {transfers.length > 0 && `(${transfers.length})`}
              </button>
              <button
                onClick={() => setTerminalOpen((v) => !v)}
                title="打开/关闭 终端"
                className="bg-white/20 border-white/30 hover:bg-white/30 text-white border px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2"
              >
                🖥️ 终端
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-green-400 shadow-lg shadow-green-400/50'
                    : 'bg-red-400 shadow-lg shadow-red-400/50'
                }`}
              ></div>
              <span
                className={`text-sm font-medium ${isConnected ? 'text-green-100' : 'text-red-100'}`}
              >
                {connectionStatus}
              </span>
              {currentServer && <span className="text-sm text-white/80">• {currentServer}</span>}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2"
              title={isDarkMode ? '切换到浅色模式' : '切换到深色模式'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

            {/* Disconnect Button */}
            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="bg-red-500/80 hover:bg-red-600 text-white border border-red-400 px-3 py-2 rounded-md transition-colors duration-200"
              >
                断开连接
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - 文件区 + 终端区 垂直分割 */}
      <div id="main-split-container" className="flex flex-col flex-1 h-full overflow-hidden">
        {/* 文件区（占更多空间） */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex h-full">
            {/* Left Panel - Local Files */}
            <div className="w-1/2 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-0 overflow-hidden">
              <LocalFileExplorer
                onAddTransfer={addTransfer}
                onCurrentPathChange={setLocalCurrentPath}
              />
            </div>

            {/* Right Panel - Remote Files */}
            <div className="w-1/2 bg-white dark:bg-gray-800 flex flex-col min-h-0 overflow-hidden">
              {isConnected ? (
                <>
                  {/* Remote File Explorer */}
                  <div className="flex-1 min-h-0">
                    <RemoteFileExplorer
                      ref={remoteFileExplorerRef}
                      onAddTransfer={addRemoteTransfer}
                    />
                  </div>

                  {/* Transfer Modal (popup) - 使用抽离组件 */}
                  <Modal
                    isOpen={showTransferModal}
                    onClose={() => setShowTransferModal(false)}
                    title="传输"
                  >
                    <FileTransfer transfers={transfers} onRemoveTransfer={removeTransfer} />
                  </Modal>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="text-6xl mb-4 opacity-50">🌐</div>
                  <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                    暂无 FTP 连接
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    连接到 FTP 服务器以浏览远程文件
                  </p>
                  <button
                    onClick={() => setShowConnectionManager(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    管理连接
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 拖动条（仅在 terminal 打开且未最大化时显示） */}
        {terminalOpen && !terminalMaximized && (
          <div
            className="h-2 cursor-row-resize bg-transparent"
            onMouseDown={() => {
              draggingRef.current = true
              document.body.style.userSelect = 'none'
            }}
          />
        )}

        {/* 终端区 */}
        {terminalOpen && (
          <div
            style={{ height: terminalMaximized ? '100%' : `${terminalHeight}px` }}
            className="border-t border-gray-200 dark:border-gray-700 bg-gray-900"
          >
            <TerminalPanel
              isOpen={terminalOpen}
              onClose={() => setTerminalOpen(false)}
              onToggleMaximize={() => setTerminalMaximized((v) => !v)}
              isMaximized={terminalMaximized}
              isConnected={isConnected}
              currentServer={currentServer}
            />
          </div>
        )}
      </div>

      {/* Connection Manager Modal */}
      <ConnectionManager
        isOpen={showConnectionManager}
        onClose={() => setShowConnectionManager(false)}
        onConnect={handleConnect}
      />
    </div>
  )
}

export default FTPManager
