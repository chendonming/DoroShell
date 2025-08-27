import React from 'react'
import type { TransferItem } from '../../../types'

interface FileTransferProps {
  transfers: TransferItem[]
  onRemoveTransfer: (id: string) => void
}

const FileTransfer: React.FC<FileTransferProps> = ({ transfers, onRemoveTransfer }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: TransferItem['status']): string => {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'uploading':
      case 'downloading':
        return '⬆️'
      case 'completed':
        return '✅'
      case 'failed':
        return '❌'
      default:
        return '⏳'
    }
  }

  const getStatusText = (status: TransferItem['status']): string => {
    switch (status) {
      case 'pending':
        return 'Waiting'
      case 'uploading':
        return 'Uploading'
      case 'downloading':
        return 'Downloading'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  const clearCompleted = (): void => {
    transfers
      .filter((item) => item.status === 'completed')
      .forEach((item) => {
        onRemoveTransfer(item.id)
      })
  }

  const retryFailed = (): void => {
    // TODO: 实现重试失败的传输
    console.log('Retry failed transfers')
  }

  const removeItem = (id: string): void => {
    onRemoveTransfer(id)
  }

  return (
    <div className="transfer-panel">
      <div className="transfer-header">
        <div className="transfer-title-group">
          <h3 className="transfer-title">File Transfers</h3>
          <span className="transfer-count">{transfers.length} items</span>
        </div>
        <div className="transfer-actions">
          <button
            onClick={clearCompleted}
            className="btn btn-small"
            disabled={transfers.filter((item) => item.status === 'completed').length === 0}
          >
            Clear Completed
          </button>
          <button
            onClick={retryFailed}
            className="btn btn-small"
            disabled={transfers.filter((item) => item.status === 'failed').length === 0}
          >
            Retry Failed
          </button>
        </div>
      </div>

      <div className="transfer-content">
        {transfers.length === 0 ? (
          <div className="transfer-empty">
            <div className="transfer-empty-icon">📁</div>
            <p>No file transfers</p>
            <p className="transfer-empty-desc">
              Files will appear here when you start uploading or downloading
            </p>
          </div>
        ) : (
          <div className="transfer-list">
            {transfers.map((item) => (
              <div key={item.id} className={`transfer-item ${item.status}`}>
                <div className="transfer-info">
                  <div className="transfer-file">
                    <span className="transfer-icon">{item.type === 'upload' ? '⬆️' : '⬇️'}</span>
                    <div className="transfer-details">
                      <div className="transfer-name">{item.filename}</div>
                      <div className="transfer-size">{formatFileSize(item.size)}</div>
                    </div>
                  </div>
                  <div className="transfer-status">
                    <span className="status-icon">{getStatusIcon(item.status)}</span>
                    <span className="status-text">{getStatusText(item.status)}</span>
                  </div>
                </div>

                <div className="transfer-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: item.progress >= 0 ? `${item.progress}%` : '100%',
                        backgroundColor:
                          item.status === 'failed'
                            ? '#ef4444'
                            : item.status === 'completed'
                              ? '#10b981'
                              : '#3b82f6'
                      }}
                    />
                  </div>
                  <div className="progress-text">
                    {item.progress >= 0 ? `${item.progress}%` : 'Processing...'}
                  </div>
                </div>

                <div className="transfer-actions">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="btn btn-icon"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="transfer-summary">
        <div className="summary-item">
          <span className="summary-label">Completed:</span>
          <span className="summary-value">
            {transfers.filter((item) => item.status === 'completed').length}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Failed:</span>
          <span className="summary-value">
            {transfers.filter((item) => item.status === 'failed').length}
          </span>
        </div>
      </div>
    </div>
  )
}

export default FileTransfer
