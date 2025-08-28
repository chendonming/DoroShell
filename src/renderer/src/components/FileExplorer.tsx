import React, { useState, useRef } from 'react'
import type { TransferItem } from '../../../types'

interface FileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  permissions?: string
}

interface FileExplorerProps {
  onAddTransfer: (transfer: Omit<TransferItem, 'id' | 'progress' | 'status'>) => void
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onAddTransfer }) => {
  const [localPath, setLocalPath] = useState('C:\\')
  const [remotePath, setRemotePath] = useState('/')
  const [localFiles] = useState<FileItem[]>([
    { name: 'Documents', type: 'directory', size: 0, modified: '2024-01-15' },
    { name: 'Downloads', type: 'directory', size: 0, modified: '2024-01-14' },
    { name: 'Pictures', type: 'directory', size: 0, modified: '2024-01-13' },
    { name: 'test.txt', type: 'file', size: 1024, modified: '2024-01-12' },
    { name: 'document.pdf', type: 'file', size: 2048000, modified: '2024-01-11' }
  ])
  const [remoteFiles] = useState<FileItem[]>([
    { name: 'www', type: 'directory', size: 0, modified: '2024-01-15' },
    { name: 'logs', type: 'directory', size: 0, modified: '2024-01-14' },
    { name: 'config.php', type: 'file', size: 5120, modified: '2024-01-13' },
    { name: 'index.html', type: 'file', size: 3072, modified: '2024-01-12' }
  ])
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<string[]>([])
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleFileSelect = (fileName: string, isLocal: boolean): void => {
    if (isLocal) {
      setSelectedLocalFiles((prev) =>
        prev.includes(fileName) ? prev.filter((f) => f !== fileName) : [...prev, fileName]
      )
    } else {
      setSelectedRemoteFiles((prev) =>
        prev.includes(fileName) ? prev.filter((f) => f !== fileName) : [...prev, fileName]
      )
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files
    if (files && onAddTransfer) {
      Array.from(files).forEach((file) => {
        onAddTransfer({
          filename: file.name,
          type: 'upload',
          size: file.size,
          localPath: file.name,
          remotePath: `/${file.name}`
        })
      })
    }
  }

  const getFileIcon = (file: FileItem): string => {
    if (file.type === 'directory') {
      return '📁'
    }
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
      default:
        return '📄'
    }
  }

  const FileList: React.FC<{
    files: FileItem[]
    selectedFiles: string[]
    onSelect: (fileName: string) => void
    title: string
    path: string
    onPathChange: (path: string) => void
    isLocal?: boolean
  }> = ({ files, selectedFiles, onSelect, title, path, onPathChange, isLocal = false }) => (
    <div className="flex flex-col h-full">
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {isLocal && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm transition-colors"
            >
              上传文件
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            placeholder="输入路径..."
          />
          <button className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 px-3 py-2 rounded-md text-sm transition-colors">
            ↑
          </button>
          <button className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 px-3 py-2 rounded-md text-sm transition-colors">
            🔄
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                名称
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                大小
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                修改时间
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.name}
                onClick={() => onSelect(file.name)}
                className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedFiles.includes(file.name)
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                    : ''
                }`}
              >
                <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center space-x-3">
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
                  <span className="text-sm text-gray-600 dark:text-gray-400">{file.modified}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        className="hidden"
      />

      <div className="flex h-full">
        {/* Local Files */}
        <div className="flex-1 border-r border-gray-200 dark:border-gray-700">
          <FileList
            files={localFiles}
            selectedFiles={selectedLocalFiles}
            onSelect={(fileName) => handleFileSelect(fileName, true)}
            title="Local Files"
            path={localPath}
            onPathChange={setLocalPath}
            isLocal={true}
          />
        </div>

        {/* Remote Files */}
        <div className="flex-1">
          <FileList
            files={remoteFiles}
            selectedFiles={selectedRemoteFiles}
            onSelect={(fileName) => handleFileSelect(fileName, false)}
            title="Remote Files"
            path={remotePath}
            onPathChange={setRemotePath}
          />
        </div>
      </div>
    </>
  )
}

export default FileExplorer
