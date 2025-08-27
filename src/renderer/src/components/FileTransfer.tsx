import React from 'react'

interface TransferItem {
  id: string
  name: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  type: 'upload' | 'download'
}

interface FileTransferProps {
  queue: TransferItem[]
  onUpdateQueue: (queue: TransferItem[]) => void
}

const FileTransfer: React.FC<FileTransferProps> = ({ queue, onUpdateQueue }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (
    status: TransferItem['status'],
    type: TransferItem['type']
  ): React.ReactNode => {
    if (status === 'uploading') {
      return (
        <span
          className="spinner"
          style={{ width: '1rem', height: '1rem', color: '#3b82f6' }}
        ></span>
      )
    }

    if (status === 'completed') {
      return (
        <svg
          style={{ width: '1rem', height: '1rem', color: '#10b981' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }

    if (status === 'failed') {
      return (
        <svg
          style={{ width: '1rem', height: '1rem', color: '#ef4444' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )
    }

    // Default icon based on type
    if (type === 'upload') {
      return (
        <svg
          style={{ width: '1rem', height: '1rem', color: '#6b7280' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      )
    }

    return (
      <svg
        style={{ width: '1rem', height: '1rem', color: '#6b7280' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V8"
        />
      </svg>
    )
  }

  const clearCompleted = (): void => {
    const filtered = queue.filter((item) => item.status !== 'completed')
    onUpdateQueue(filtered)
  }

  const retryFailed = (): void => {
    const updated = queue.map((item) =>
      item.status === 'failed' ? { ...item, status: 'pending' as const, progress: 0 } : item
    )
    onUpdateQueue(updated)
  }

  const cancelTransfer = (id: string): void => {
    const filtered = queue.filter((item) => item.id !== id)
    onUpdateQueue(filtered)
  }

  const getProgressBarClass = (status: TransferItem['status']): string => {
    switch (status) {
      case 'completed':
        return 'progress-fill completed'
      case 'failed':
        return 'progress-fill failed'
      case 'uploading':
        return 'progress-fill uploading'
      default:
        return 'progress-fill pending'
    }
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'white' }}
    >
      <div className="transfer-header">
        <div className="transfer-header-content">
          <h3 className="transfer-title">Transfer Queue</h3>
          <span className="transfer-count">{queue.length} items</span>
        </div>

        <div className="transfer-actions">
          <button onClick={clearCompleted} className="btn-small btn-gray">
            Clear Completed
          </button>
          <button onClick={retryFailed} className="btn-small btn-red">
            Retry Failed
          </button>
        </div>
      </div>

      <div className="transfer-list">
        {queue.length === 0 ? (
          <div className="transfer-empty">
            <svg
              className="transfer-empty-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="transfer-empty-text">No transfers in queue</p>
            <p className="transfer-empty-subtext">Upload or download files to see them here</p>
          </div>
        ) : (
          <div className="transfer-items">
            {queue.map((item) => (
              <div key={item.id} className="transfer-item">
                <div className="transfer-item-header">
                  <div className="transfer-item-info">
                    <div className="transfer-item-icon">
                      {getStatusIcon(item.status, item.type)}
                    </div>
                    <div className="transfer-item-details">
                      <p className="transfer-item-name">{item.name}</p>
                      <p className="transfer-item-size">{formatFileSize(item.size)}</p>
                    </div>
                  </div>

                  <button onClick={() => cancelTransfer(item.id)} className="transfer-item-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="transfer-item-progress">
                  <div className="transfer-progress-info">
                    <span className={`transfer-status ${item.status}`}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                    <span className="transfer-percentage">{item.progress}%</span>
                  </div>

                  <div className="progress-bar">
                    <div
                      className={getProgressBarClass(item.status)}
                      style={{ width: `${item.progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transfer Statistics */}
      <div className="transfer-stats">
        <div className="stats-grid">
          <div className="stat-item">
            <p className="stat-label">Completed</p>
            <p className="stat-value completed">
              {queue.filter((item) => item.status === 'completed').length}
            </p>
          </div>
          <div className="stat-item">
            <p className="stat-label">Failed</p>
            <p className="stat-value failed">
              {queue.filter((item) => item.status === 'failed').length}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FileTransfer
