import React, { useState, useEffect, useRef } from 'react'
import ConnectionManager from './ConnectionManager'
import LocalFileExplorer from './LocalFileExplorer'
import RemoteFileExplorer, { type RemoteFileExplorerRef } from './RemoteFileExplorer'
import FileTransfer from './FileTransfer'
import type { FTPCredentials, TransferItem, TransferProgress } from '../../../types'

const FTPManager: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('未连接')
  const [currentServer, setCurrentServer] = useState<string>('')
  const [transfers, setTransfers] = useState<TransferItem[]>([])
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showConnectionManager, setShowConnectionManager] = useState(false)
  const [showTransferPanel, setShowTransferPanel] = useState(false)
  const [localCurrentPath, setLocalCurrentPath] = useState<string>('')
  const remoteFileExplorerRef = useRef<RemoteFileExplorerRef>(null)

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
      setIsConnected(status)

      if (status) {
        const credentials = await window.api.ftp.getCurrentCredentials()
        if (credentials) {
          setCurrentServer(`${credentials.username}@${credentials.host}`)
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
        setCurrentServer(`${credentials.username}@${credentials.host}`)
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
    transfer: Omit<TransferItem, 'id' | 'progress' | 'status' | 'localPath'>
  ): Promise<void> => {
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
        const result = await window.api.ftp.downloadFile(
          transfer.remotePath,
          transfer.localPath,
          newTransfer.id
        )

        if (result.success) {
          // 下载成功，更新状态为完成
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === newTransfer.id ? { ...t, status: 'completed', progress: 100 } : t
            )
          )
        } else {
          // 下载失败
          setTransfers((prev) =>
            prev.map((t) => (t.id === newTransfer.id ? { ...t, status: 'failed' } : t))
          )
        }
      } else if (transfer.type === 'upload') {
        const result = await window.api.ftp.uploadFile(transfer.localPath, transfer.remotePath)

        if (result.success) {
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
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">FTP Manager</h1>

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
                onClick={() => setShowTransferPanel(!showTransferPanel)}
                className={`${
                  showTransferPanel ? 'bg-white/30 border-white/50' : 'bg-white/20 border-white/30'
                } hover:bg-white/30 text-white border px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2`}
                title={showTransferPanel ? '隐藏传输面板' : '显示传输面板'}
              >
                {showTransferPanel ? '📤' : '📥'} 传输{' '}
                {transfers.length > 0 && `(${transfers.length})`}
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

      {/* Main Content - Dual Panel Layout */}
      <div className="flex flex-1 h-full overflow-hidden">
        {/* Left Panel - Local Files */}
        <div className="w-1/2 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <LocalFileExplorer
            onAddTransfer={addTransfer}
            onCurrentPathChange={setLocalCurrentPath}
          />
        </div>

        {/* Right Panel - Remote Files */}
        <div className="w-1/2 bg-white dark:bg-gray-800 flex flex-col">
          {isConnected ? (
            <>
              {/* Remote File Explorer */}
              <div className={`${showTransferPanel ? 'flex-1' : 'h-full'}`}>
                <RemoteFileExplorer ref={remoteFileExplorerRef} onAddTransfer={addRemoteTransfer} />
              </div>

              {/* Transfer Panel - Integrated as bottom section */}
              {showTransferPanel && (
                <div className="h-64 border-t border-gray-200 dark:border-gray-700 animate-slide-in">
                  <FileTransfer transfers={transfers} onRemoveTransfer={removeTransfer} />
                </div>
              )}
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
