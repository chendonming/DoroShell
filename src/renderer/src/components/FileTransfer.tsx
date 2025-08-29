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
        return '等待中'
      case 'uploading':
        return '上传中'
      case 'downloading':
        return '下载中'
      case 'completed':
        return '已完成'
      case 'failed':
        return '失败'
      default:
        return '未知'
    }
  }

  const getStatusColor = (status: TransferItem['status']): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'uploading':
      case 'downloading':
        return 'text-blue-600 dark:text-blue-400'
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getProgressBarColor = (status: TransferItem['status']): string => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500'
      case 'uploading':
      case 'downloading':
        return 'bg-blue-500'
      case 'completed':
        return 'bg-green-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
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
    console.log('重试失败的传输')
  }

  const removeItem = (id: string): void => {
    onRemoveTransfer(id)
  }

  const completedCount = transfers.filter((item) => item.status === 'completed').length
  const failedCount = transfers.filter((item) => item.status === 'failed').length

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">文件传输</h3>
            <span className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
              {transfers.length} 项
            </span>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={clearCompleted}
            disabled={completedCount === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1 rounded-md text-sm transition-colors"
          >
            清除已完成
          </button>
          <button
            onClick={retryFailed}
            disabled={failedCount === 0}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1 rounded-md text-sm transition-colors"
          >
            重试失败
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-6xl mb-4 opacity-50">📁</div>
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无文件传输</h4>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              开始上传或下载时，文件将显示在此处
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {transfers.map((item) => (
              <div
                key={item.id}
                className={`bg-white dark:bg-gray-700 border rounded-lg p-4 shadow-sm transition-all duration-200 ${
                  item.status === 'completed'
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                    : item.status === 'failed'
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                      : item.status === 'uploading' || item.status === 'downloading'
                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <span className="text-xl">{item.type === 'upload' ? '⬆️' : '⬇️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.filename}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(item.size)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <span className="text-sm">{getStatusIcon(item.status)}</span>
                      <span className={`text-xs font-medium ${getStatusColor(item.status)}`}>
                        {getStatusText(item.status)}
                      </span>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded transition-colors"
                      title="移除"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center space-x-3">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${getProgressBarColor(item.status)}`}
                      style={{
                        width: item.progress >= 0 ? `${Math.min(item.progress, 100)}%` : '100%'
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-mono min-w-[3rem] text-right">
                    {item.progress >= 0 ? `${item.progress}%` : '---'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex justify-around text-center">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">成功</div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
              {completedCount}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">失败</div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">
              {failedCount}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">总共</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {transfers.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FileTransfer
