import { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import type { TransferItem } from '../../../types'
import PathInput from './PathInput'

interface RemoteFileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  permissions?: string
}

interface RemoteFileExplorerProps {
  onAddTransfer: (
    transfer: Omit<TransferItem, 'id' | 'progress' | 'status' | 'localPath'> & {
      draggedFile?: File
    }
  ) => Promise<void>
}

export interface RemoteFileExplorerRef {
  refresh: () => Promise<void>
}

interface OverwriteConfirmDialog {
  visible: boolean
  fileName: string
  onConfirm: (action: 'yes' | 'no' | 'yesToAll' | 'noToAll') => void
}

interface DragState {
  isDragOver: boolean
  dragDepth: number
}

const RemoteFileExplorer = forwardRef<RemoteFileExplorerRef, RemoteFileExplorerProps>(
  ({ onAddTransfer }, ref) => {
    const [remotePath, setRemotePath] = useState('/')
    const [files, setFiles] = useState<RemoteFileItem[]>([])
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [dragState, setDragState] = useState<DragState>({ isDragOver: false, dragDepth: 0 })
    const [overwriteDialog, setOverwriteDialog] = useState<OverwriteConfirmDialog>({
      visible: false,
      fileName: '',
      onConfirm: () => {}
    })
    const [overwriteAction, setOverwriteAction] = useState<
      'yes' | 'no' | 'yesToAll' | 'noToAll' | null
    >(null)

    const loadRemoteFiles = useCallback(async (): Promise<void> => {
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
    }, [remotePath])

    // 暴露刷新方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        refresh: loadRemoteFiles
      }),
      [loadRemoteFiles]
    )

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
            alert('无法访问指定路径')
          }
        } catch (error) {
          console.error('切换目录失败:', error)
          alert('切换目录失败')
        }
      }
    }

    const navigateUp = (): void => {
      if (remotePath !== '/') {
        const parentPath = remotePath.split('/').slice(0, -1).join('/') || '/'
        navigateToPath(parentPath)
      }
    }

    // 拖拽处理函数
    const handleDragEnter = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setDragState((prev) => ({
        isDragOver: true,
        dragDepth: prev.dragDepth + 1
      }))
    }

    const handleDragLeave = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setDragState((prev) => {
        const newDepth = prev.dragDepth - 1
        return {
          isDragOver: newDepth > 0,
          dragDepth: newDepth
        }
      })
    }

    const handleDragOver = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      setDragState({ isDragOver: false, dragDepth: 0 })

      const items = Array.from(e.dataTransfer.items)
      processDroppedItems(items)
    }

    // 处理拖放的文件和文件夹
    const processDroppedItems = async (items: DataTransferItem[]): Promise<void> => {
      const files: Array<{ file: File; path: string }> = []

      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry) {
            await processEntry(entry, '', files)
          }
        }
      }

      if (files.length > 0) {
        await handleFileUploads(files)
      }
    }

    // 递归处理文件夹条目
    const processEntry = async (
      entry: FileSystemEntry,
      basePath: string,
      files: Array<{ file: File; path: string }>
    ): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        return new Promise((resolve) => {
          fileEntry.file((file) => {
            const relativePath = basePath ? `${basePath}/${file.name}` : file.name
            files.push({ file, path: relativePath })
            resolve()
          })
        })
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry
        const reader = dirEntry.createReader()

        return new Promise((resolve) => {
          reader.readEntries(async (entries) => {
            for (const childEntry of entries) {
              const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name
              await processEntry(childEntry, newBasePath, files)
            }
            resolve()
          })
        })
      }
    }

    // 处理文件上传，包括覆盖确认
    const handleFileUploads = async (
      uploads: Array<{ file: File; path: string }>
    ): Promise<void> => {
      setOverwriteAction(null)

      for (const upload of uploads) {
        await processUpload(upload)
      }

      // 清理
      setOverwriteAction(null)
    }

    // 处理单个文件上传
    const processUpload = async (upload: { file: File; path: string }): Promise<void> => {
      const targetPath = remotePath === '/' ? `/${upload.path}` : `${remotePath}/${upload.path}`

      // 检查是否存在同名文件
      const existingFile = files.find((f) => f.name === upload.file.name)

      if (existingFile && overwriteAction !== 'yesToAll') {
        if (overwriteAction === 'noToAll') {
          return // 跳过这个文件
        }

        // 显示覆盖确认对话框
        return new Promise((resolve) => {
          setOverwriteDialog({
            visible: true,
            fileName: upload.file.name,
            onConfirm: async (action) => {
              setOverwriteDialog({ visible: false, fileName: '', onConfirm: () => {} })

              if (action === 'yesToAll' || action === 'noToAll') {
                setOverwriteAction(action)
              }

              if (action === 'yes' || action === 'yesToAll') {
                await performUpload(upload, targetPath)
              }

              resolve()
            }
          })
        })
      } else {
        // 没有冲突或者已经选择了全部覆盖
        await performUpload(upload, targetPath)
      }
    }

    // 执行实际的文件上传
    const performUpload = async (
      upload: { file: File; path: string },
      targetPath: string
    ): Promise<void> => {
      try {
        // 添加到传输队列
        await onAddTransfer({
          type: 'upload',
          filename: upload.file.name,
          size: upload.file.size,
          remotePath: targetPath,
          draggedFile: upload.file // 传递File对象给FTPManager处理
        })
      } catch (error) {
        console.error('上传失败:', error)
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
      <div
        className={`h-full flex flex-col bg-white dark:bg-gray-800 ${
          dragState.isDragOver
            ? 'border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-lg">🌐</span>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">远程文件</h2>
            </div>
            {selectedFiles.size > 0 && (
              <button
                onClick={downloadSelectedFiles}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm transition-colors duration-200 flex items-center gap-2"
              >
                ⬇️ 下载 ({selectedFiles.size})
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
              ⬆️ 上级
            </button>
            <PathInput
              value={remotePath}
              onChange={setRemotePath}
              onNavigate={navigateToPath}
              placeholder="输入远程路径..."
              historyKey="remote"
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
              <span className="ml-2 text-gray-600 dark:text-gray-400">加载中...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              <span className="text-4xl mb-2">📂</span>
              <span>此目录为空</span>
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
                    名称
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    大小
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    修改时间
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    权限
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

        {/* 拖拽提示覆盖层 */}
        {dragState.isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm z-50">
            <div className="text-center">
              <div className="text-4xl mb-4">📁</div>
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-300">
                将文件和文件夹拖放到这里上传
              </div>
              <div className="text-sm text-blue-500 dark:text-blue-400 mt-2">
                支持多文件和文件夹上传
              </div>
            </div>
          </div>
        )}

        {/* 覆盖确认对话框 */}
        {overwriteDialog.visible && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl">
              <div className="flex items-center space-x-3 mb-4">
                <div className="text-2xl">⚠️</div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    文件已存在
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    文件 &ldquo;{overwriteDialog.fileName}&rdquo; 已存在，是否要覆盖？
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => overwriteDialog.onConfirm('yes')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
                  >
                    是
                  </button>
                  <button
                    onClick={() => overwriteDialog.onConfirm('no')}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
                  >
                    否
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => overwriteDialog.onConfirm('yesToAll')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
                  >
                    全部为是
                  </button>
                  <button
                    onClick={() => overwriteDialog.onConfirm('noToAll')}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
                  >
                    全部为否
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
)

RemoteFileExplorer.displayName = 'RemoteFileExplorer'

export default RemoteFileExplorer
