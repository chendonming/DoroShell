import React, { useState, useEffect } from 'react'
import type { TransferItem } from '../../../types'

interface RemoteFileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  permissions?: string
}

interface RemoteFileExplorerProps {
  onAddTransfer: (
    transfer: Omit<TransferItem, 'id' | 'progress' | 'status' | 'localPath'>
  ) => Promise<void>
}

const RemoteFileExplorer: React.FC<RemoteFileExplorerProps> = ({ onAddTransfer }) => {
  const [remotePath, setRemotePath] = useState('/')
  const [files, setFiles] = useState<RemoteFileItem[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load remote files when path changes
    const loadFiles = async (): Promise<void> => {
      setLoading(true)
      try {
        // 检查是否已连接
        const isConnected = await window.api.ftp.getConnectionStatus()
        if (!isConnected) {
          setFiles([])
          setLoading(false)
          return
        }

        // 使用真实的FTP API获取目录列表
        const result = await window.api.ftp.listDirectory(remotePath)

        if (result.success && result.files) {
          // 转换为RemoteFileItem格式
          const remoteFiles: RemoteFileItem[] = result.files.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            modified: file.modified,
            permissions: file.permissions
          }))
          setFiles(remoteFiles)
        } else {
          console.error('获取远程目录失败:', result.error)
          setFiles([])
        }
      } catch (error) {
        console.error('Failed to load remote files:', error)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
  }, [remotePath])

  const loadRemoteFiles = async (): Promise<void> => {
    setLoading(true)
    try {
      const isConnected = await window.api.ftp.getConnectionStatus()
      if (!isConnected) {
        setFiles([])
        return
      }

      const result = await window.api.ftp.listDirectory(remotePath)
      if (result.success && result.files) {
        const remoteFiles: RemoteFileItem[] = result.files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          modified: file.modified,
          permissions: file.permissions
        }))
        setFiles(remoteFiles)
      } else {
        console.error('刷新目录失败:', result.error)
        setFiles([])
      }
    } catch (error) {
      console.error('刷新远程文件失败:', error)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const navigateToPath = async (newPath: string): Promise<void> => {
    if (newPath !== remotePath) {
      try {
        // 使用FTP changeDirectory API
        const result = await window.api.ftp.changeDirectory(newPath)
        if (result.success) {
          setRemotePath(newPath)
          setSelectedFiles(new Set())
        } else {
          console.error('无法切换到目录:', newPath, result.error)
        }
      } catch (error) {
        console.error('切换目录失败:', error)
      }
    }
  }

  const navigateUp = (): void => {
    if (remotePath !== '/') {
      const parentPath = remotePath.split('/').slice(0, -1).join('/') || '/'
      navigateToPath(parentPath)
    }
  }

  const handleDoubleClick = async (file: RemoteFileItem): Promise<void> => {
    if (file.type === 'directory') {
      const newPath = remotePath === '/' ? `/${file.name}` : `${remotePath}/${file.name}`
      await navigateToPath(newPath)
    }
  }

  const handleFileSelection = (filePath: string, isSelected: boolean): void => {
    const newSelection = new Set(selectedFiles)
    if (isSelected) {
      newSelection.add(filePath)
    } else {
      newSelection.delete(filePath)
    }
    setSelectedFiles(newSelection)
  }

  const downloadSelectedFiles = async (): Promise<void> => {
    const filesToDownload = files.filter(
      (file) => selectedFiles.has(file.name) && file.type === 'file'
    )

    for (const file of filesToDownload) {
      await onAddTransfer({
        filename: file.name,
        size: file.size,
        type: 'download',
        remotePath: remotePath === '/' ? `/${file.name}` : `${remotePath}/${file.name}`
      })
    }

    setSelectedFiles(new Set())
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    return (
      new Date(dateString).toLocaleDateString() +
      ' ' +
      new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  const getFileIcon = (file: RemoteFileItem): string => {
    if (file.type === 'directory') return '📁'

    const ext = file.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'txt':
      case 'md':
        return '📄'
      case 'pdf':
        return '📕'
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️'
      case 'mp4':
      case 'avi':
      case 'mov':
        return '🎬'
      case 'mp3':
      case 'wav':
        return '🎵'
      case 'zip':
      case 'rar':
      case '7z':
        return '📦'
      case 'php':
      case 'js':
      case 'html':
      case 'css':
        return '💻'
      default:
        return '📄'
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-lg">🌐</span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Remote Files</h2>
          </div>
          {selectedFiles.size > 0 && (
            <button
              onClick={downloadSelectedFiles}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm transition-colors duration-200 flex items-center gap-2"
            >
              ⬇️ Download ({selectedFiles.size})
            </button>
          )}
        </div>

        {/* Path Navigation */}
        <div className="mt-3 flex items-center space-x-2">
          <button
            onClick={navigateUp}
            disabled={remotePath === '/'}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-sm transition-colors duration-200"
          >
            ⬆️ Up
          </button>
          <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 font-mono">
            {remotePath}
          </div>
          <button
            onClick={loadRemoteFiles}
            disabled={loading}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-sm transition-colors duration-200"
          >
            {loading ? '⟳' : '🔄'}
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin text-2xl">⟳</div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <span className="text-4xl mb-2">📂</span>
            <span>This directory is empty</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={
                      files.length > 0 &&
                      files.every((f) => f.type === 'directory' || selectedFiles.has(f.name))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles(
                          new Set(files.filter((f) => f.type === 'file').map((f) => f.name))
                        )
                      } else {
                        setSelectedFiles(new Set())
                      }
                    }}
                  />
                  Name
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Size
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Modified
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Permissions
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.name}
                  onDoubleClick={() => handleDoubleClick(file)}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedFiles.has(file.name)
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                      : ''
                  }`}
                >
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                      {file.type === 'file' && (
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.name)}
                          onChange={(e) => handleFileSelection(file.name, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <span className="text-lg">{getFileIcon(file)}</span>
                      <span className="text-sm text-gray-900 dark:text-white font-medium">
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {file.type === 'directory' ? '—' : formatFileSize(file.size)}
                    </span>
                  </td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(file.modified)}
                    </span>
                  </td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-500 font-mono">
                      {file.permissions || 'rwxr-xr-x'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default RemoteFileExplorer
