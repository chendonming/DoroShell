import React, { useState, useEffect } from 'react'
import FTPConnection from './FTPConnection'
import FileExplorer from './FileExplorer'
import FileTransfer from './FileTransfer'
import type { FTPCredentials, TransferItem, TransferProgress } from '../../../types'

const FTPManager: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('')
  const [transfers, setTransfers] = useState<TransferItem[]>([])
  const [, setCurrentCredentials] = useState<FTPCredentials | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)

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
        setCurrentCredentials(credentials)
        setConnectionStatus(`Connected to ${credentials?.host}`)
      } else {
        setConnectionStatus('Not connected')
      }
    } catch (error) {
      console.error('Failed to check connection status:', error)
      setConnectionStatus('Connection check failed')
    }
  }

  const handleConnect = async (credentials: FTPCredentials): Promise<void> => {
    setConnectionStatus('Connecting...')

    try {
      const result = await window.api.ftp.connect(credentials)

      if (result.success) {
        setIsConnected(true)
        setCurrentCredentials(credentials)
        setConnectionStatus(result.message || 'Connected successfully')
      } else {
        setIsConnected(false)
        setConnectionStatus(result.error || 'Connection failed')
      }
    } catch (error) {
      console.error('Connection error:', error)
      setIsConnected(false)
      setConnectionStatus('Connection failed')
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    try {
      await window.api.ftp.disconnect()
      setIsConnected(false)
      setCurrentCredentials(null)
      setConnectionStatus('Disconnected')
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

  const addTransfer = (transfer: Omit<TransferItem, 'id' | 'progress' | 'status'>): void => {
    const newTransfer: TransferItem = {
      ...transfer,
      id: Math.random().toString(36).substr(2, 9),
      progress: 0,
      status: 'pending'
    }

    setTransfers((prev) => [...prev, newTransfer])
  }

  const removeTransfer = (id: string): void => {
    setTransfers((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">FTP Manager</h1>
          <div className="flex items-center gap-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-2 rounded-md transition-colors duration-200 flex items-center gap-2"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? (
                <span className="text-lg">☀️</span>
              ) : (
                <span className="text-lg">🌙</span>
              )}
            </button>
            
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
            </div>
            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-4 py-2 rounded-md transition-colors duration-200"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {!isConnected ? (
        <FTPConnection onConnect={handleConnect} />
      ) : (
        <div className="flex flex-1 h-full overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
            <FileExplorer onAddTransfer={addTransfer} />
          </div>

          {/* Transfer Panel */}
          <div className="w-96 bg-white dark:bg-gray-800 flex flex-col">
            <FileTransfer transfers={transfers} onRemoveTransfer={removeTransfer} />
          </div>
        </div>
      )}
    </div>
  )
}

export default FTPManager
