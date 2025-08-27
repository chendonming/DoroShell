import React, { useState } from 'react'
import FTPConnection from './FTPConnection'
import FileExplorer from './FileExplorer'
import FileTransfer from './FileTransfer'

interface FTPCredentials {
  host: string
  port: number
  username: string
  password: string
  protocol: 'ftp' | 'sftp'
}

interface TransferItem {
  id: string
  name: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  type: 'upload' | 'download'
}

const FTPManager: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [credentials, setCredentials] = useState<FTPCredentials | null>(null)
  const [transferQueue, setTransferQueue] = useState<TransferItem[]>([])

  const handleConnect = (creds: FTPCredentials): void => {
    setCredentials(creds)
    setIsConnected(true)
  }

  const handleDisconnect = (): void => {
    setIsConnected(false)
    setCredentials(null)
    setTransferQueue([])
  }

  const handleUpload = (files: File[]): void => {
    const newTransfers: TransferItem[] = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending' as const,
      type: 'upload' as const
    }))
    setTransferQueue((prev) => [...prev, ...newTransfers])
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
                {isConnected ? `Connected to ${credentials?.host}` : 'Disconnected'}
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
            <FileExplorer credentials={credentials!} onUpload={handleUpload} />
          </div>

          {/* Transfer Panel */}
          <div className="transfer-panel">
            <FileTransfer queue={transferQueue} onUpdateQueue={setTransferQueue} />
          </div>
        </div>
      )}
    </div>
  )
}

export default FTPManager
