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

  useEffect(() => {
    // 检查连接状态
    checkConnectionStatus()

    // 设置传输进度监听
    const cleanup = window.api.ftp.onTransferProgress(handleTransferProgress)

    return cleanup
  }, [])

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
    <div className="ftp-container">
      {/* Header */}
      <div className="ftp-header">
        <div className="ftp-header-content">
          <h1 className="ftp-title">FTP Manager</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="status-indicator">
              <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
              <span className={`status-text ${isConnected ? 'connected' : 'disconnected'}`}>
                {connectionStatus}
              </span>
            </div>
            {isConnected && (
              <button onClick={handleDisconnect} className="btn btn-disconnect">
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {!isConnected ? (
        <FTPConnection onConnect={handleConnect} />
      ) : (
        <div className="main-content">
          {/* Main Content Area */}
          <div className="file-explorer">
            <FileExplorer onAddTransfer={addTransfer} />
          </div>

          {/* Transfer Panel */}
          <div className="transfer-panel">
            <FileTransfer transfers={transfers} onRemoveTransfer={removeTransfer} />
          </div>
        </div>
      )}
    </div>
  )
}

export default FTPManager
