import React, { useState, useEffect, useCallback } from 'react'
import type { TransferItem } from '../../../types'
import ContextMenu from './ContextMenu'
import PromptDialog from './PromptDialog'

interface LocalFileExplorerProps {
  onAddTransfer: (transfer: TransferItem) => void
  onCurrentPathChange: (path: string) => void
}

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

const LocalFileExplorer: React.FC<LocalFileExplorerProps> = ({
  onAddTransfer,
  onCurrentPathChange
}) => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [pathInput, setPathInput] = useState<string>('')

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    target?: string
  }>({
    visible: false,
    x: 0,
    y: 0
  })

  // 对话框状态
  const [promptDialog, setPromptDialog] = useState<{
    visible: boolean
    title: string
    placeholder: string
    defaultValue: string
    action: string
  }>({
    visible: false,
    title: '',
    placeholder: '',
    defaultValue: '',
    action: ''
  })

  // 新创建的文件名，用于自动定位
  const [newlyCreatedItem, setNewlyCreatedItem] = useState<string | null>(null)
  const [highlightedItem, setHighlightedItem] = useState<string | null>(null)

  const updateCurrentPath = useCallback(
    (newPath: string): void => {
      setCurrentPath(newPath)
      setPathInput(newPath)
      onCurrentPathChange(newPath)
    },
    [onCurrentPathChange]
  )

  useEffect(() => {
    const initializeHomePath = async (): Promise<void> => {
      try {
        const homePath = await window.api.path.getHomePath()
        updateCurrentPath(homePath)
      } catch (error) {
        console.error('获取主目录失败:', error)
        updateCurrentPath('C:\\Users')
      }
    }

    initializeHomePath()
  }, [updateCurrentPath])

  useEffect(() => {
    if (currentPath) {
      loadDirectory(currentPath)
    }
  }, [currentPath])

  // 当文件列表更新且有新创建的项目时，自动定位到该项目
  useEffect(() => {
    if (newlyCreatedItem && files.length > 0) {
      console.log('尝试定位新创建的项目:', newlyCreatedItem)
      const createdFile = files.find((file) => file.name === newlyCreatedItem)
      if (createdFile) {
        console.log('找到新创建的文件:', createdFile)
        setTimeout(() => {
          const fileElement = document.querySelector(`[data-file-name="${newlyCreatedItem}"]`)
          console.log('查找的元素:', fileElement)
          if (fileElement) {
            // 滚动到视图中心
            fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

            // 选中文件
            setSelectedFiles(new Set([createdFile.path]))

            // 添加高亮效果
            setHighlightedItem(newlyCreatedItem)

            // 3秒后移除高亮
            setTimeout(() => {
              setHighlightedItem(null)
            }, 3000)

            console.log('已定位到新创建的项目:', newlyCreatedItem)
          }
        }, 100)
        setNewlyCreatedItem(null)
      } else {
        console.log('未找到新创建的文件:', newlyCreatedItem)
      }
    }
  }, [files, newlyCreatedItem])

  const loadDirectory = async (path: string): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.fs.readDirectory(path)
      if (result.success && result.files) {
        setFiles(result.files)
      } else {
        console.error('读取目录失败:', result.error)
        setFiles([])
      }
    } catch (error) {
      console.error('加载本地文件失败:', error)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = (): void => {
    if (currentPath) {
      loadDirectory(currentPath)
    }
  }

  const handleDoubleClick = (file: FileItem): void => {
    if (file.type === 'directory') {
      updateCurrentPath(file.path)
    }
  }

  const handleFileSelection = (filePath: string, checked: boolean): void => {
    const newSelection = new Set(selectedFiles)
    if (checked) {
      newSelection.add(filePath)
    } else {
      newSelection.delete(filePath)
    }
    setSelectedFiles(newSelection)
  }

  const handleContextMenu = (e: React.MouseEvent, fileName?: string): void => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      target: fileName
    })
  }

  const closeContextMenu = (): void => {
    setContextMenu({ visible: false, x: 0, y: 0, target: undefined })
  }

  const handlePathInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      const newPath = pathInput.trim()
      if (newPath && newPath !== currentPath) {
        navigateToPath(newPath)
      }
    } else if (e.key === 'Escape') {
      // 恢复原路径
      setPathInput(currentPath)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const navigateToPath = async (newPath: string): Promise<void> => {
    try {
      // 尝试读取目录来检查路径是否存在
      const result = await window.api.fs.readDirectory(newPath)
      if (result.success) {
        updateCurrentPath(newPath)
      } else {
        // 路径不存在，恢复原路径
        setPathInput(currentPath)
        alert('路径不存在或无法访问')
      }
    } catch (error) {
      console.error('Failed to navigate to path:', error)
      setPathInput(currentPath)
      alert('无法访问指定路径')
    }
  }

  const handleCreateFile = (): void => {
    setPromptDialog({
      visible: true,
      title: '创建文件',
      placeholder: '请输入文件名',
      defaultValue: '',
      action: 'createFile'
    })
  }

  const handleCreateDirectory = (): void => {
    setPromptDialog({
      visible: true,
      title: '创建文件夹',
      placeholder: '请输入文件夹名',
      defaultValue: '',
      action: 'createDirectory'
    })
  }

  const handleCopyPath = (): void => {
    navigator.clipboard
      .writeText(currentPath)
      .then(() => {
        console.log('路径已复制到剪贴板')
      })
      .catch((err) => {
        console.error('复制失败:', err)
      })
  }

  const handleRename = (): void => {
    // 确定要重命名的文件
    let targetFile = contextMenu.target
    if (!targetFile && selectedFiles.size === 1) {
      const selectedFile = Array.from(selectedFiles)[0]
      const file = files.find((f) => f.path === selectedFile)
      targetFile = file?.name
    }

    if (targetFile) {
      setPromptDialog({
        visible: true,
        title: '重命名',
        placeholder: '请输入新名称',
        defaultValue: targetFile,
        action: 'rename'
      })
    }
  }

  const handleDelete = async (): Promise<void> => {
    let filesToDelete: string[] = []

    if (contextMenu.target) {
      // 右键点击在文件上
      filesToDelete = [contextMenu.target]
    } else if (selectedFiles.size > 0) {
      // 有选中的文件
      filesToDelete = Array.from(selectedFiles)
        .map((path) => {
          const file = files.find((f) => f.path === path)
          return file?.name || ''
        })
        .filter((name) => name !== '')
    }

    if (filesToDelete.length === 0) {
      alert('请选择要删除的文件')
      return
    }

    const fileNames = filesToDelete.join('、')
    const confirmDelete = confirm(`确定要删除 "${fileNames}" 吗？`)
    if (!confirmDelete) return

    try {
      for (const fileName of filesToDelete) {
        const fullPath = await window.api.path.joinPath(currentPath, fileName)
        const stats = await window.api.fs.getFileStats(fullPath)

        if (stats.success && stats.stats?.isDirectory) {
          const result = await window.api.fs.deleteDirectory(fullPath)
          if (!result.success) {
            alert(`删除文件夹 "${fileName}" 失败: ${result.error}`)
            continue
          }
        } else {
          const result = await window.api.fs.deleteFile(fullPath)
          if (!result.success) {
            alert(`删除文件 "${fileName}" 失败: ${result.error}`)
            continue
          }
        }
      }

      // 清空选中状态并刷新
      setSelectedFiles(new Set())
      handleRefresh()
    } catch (error) {
      console.error('删除操作失败:', error)
      alert('删除失败')
    }
  }

  const handleUpload = (): void => {
    const filesToUpload = files.filter(
      (file) => selectedFiles.has(file.path) && file.type === 'file'
    )

    filesToUpload.forEach((file) => {
      onAddTransfer({
        id: `upload-${Date.now()}-${Math.random()}`,
        filename: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
        type: 'upload',
        localPath: file.path,
        remotePath: `/${file.name}` // 默认上传到远程根目录
      })
    })

    setSelectedFiles(new Set())
  }

  const handlePromptConfirm = async (value: string): Promise<void> => {
    const { action } = promptDialog

    try {
      switch (action) {
        case 'createFile':
          {
            const result = await window.api.fs.createFile(currentPath, value)
            if (result.success) {
              setNewlyCreatedItem(value)
              handleRefresh()
            } else {
              alert('创建文件失败: ' + result.error)
            }
          }
          break

        case 'createDirectory':
          {
            const result = await window.api.fs.createDirectory(currentPath, value)
            if (result.success) {
              setNewlyCreatedItem(value)
              handleRefresh()
            } else {
              alert('创建文件夹失败: ' + result.error)
            }
          }
          break

        case 'rename':
          {
            // 确定要重命名的文件
            let targetFile = contextMenu.target
            if (!targetFile && selectedFiles.size === 1) {
              const selectedFile = Array.from(selectedFiles)[0]
              const file = files.find((f) => f.path === selectedFile)
              targetFile = file?.name
            }

            if (targetFile) {
              const oldPath = await window.api.path.joinPath(currentPath, targetFile)
              const newPath = await window.api.path.joinPath(currentPath, value)
              const result = await window.api.fs.renameFile(oldPath, newPath)
              if (result.success) {
                setSelectedFiles(new Set()) // 清空选中状态
                setNewlyCreatedItem(value) // 定位到重命名后的文件
                handleRefresh()
              } else {
                alert('重命名失败: ' + result.error)
              }
            }
          }
          break
      }
    } catch (error) {
      console.error('操作失败:', error)
      alert('操作失败')
    }

    setPromptDialog({ visible: false, title: '', placeholder: '', defaultValue: '', action: '' })
  }

  const handlePromptCancel = (): void => {
    setPromptDialog({ visible: false, title: '', placeholder: '', defaultValue: '', action: '' })
  }

  const getContextMenuItems = (): Array<{
    label?: string
    action?: () => void
    disabled?: boolean
    separator?: boolean
    icon?: string
  }> => {
    const canModify = contextMenu.target || selectedFiles.size > 0
    const hasSelectedFiles = selectedFiles.size > 0

    return [
      {
        label: '刷新',
        action: handleRefresh,
        icon: '🔄'
      },
      {
        label: '复制路径',
        action: handleCopyPath,
        icon: '📋'
      },
      { separator: true },
      {
        label: '创建文件',
        action: handleCreateFile,
        icon: '📄'
      },
      {
        label: '创建文件夹',
        action: handleCreateDirectory,
        icon: '📁'
      },
      { separator: true },
      {
        label: '重命名',
        action: handleRename,
        disabled: !canModify,
        icon: '✏️'
      },
      {
        label: '删除',
        action: handleDelete,
        disabled: !canModify,
        icon: '🗑️'
      },
      { separator: true },
      {
        label: '上传',
        action: handleUpload,
        disabled: !hasSelectedFiles,
        icon: '⬆️'
      }
    ]
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">本地文件</h2>
        <div className="mt-2">
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathInputKeyDown}
            onBlur={() => setPathInput(currentPath)}
            placeholder="输入路径..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            title="按 Enter 键导航到路径，按 Esc 键取消"
          />
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500 dark:text-gray-400">加载中...</div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <span className="text-4xl mb-2">📂</span>
            <span>此目录为空</span>
          </div>
        ) : (
          <div onContextMenu={(e) => handleContextMenu(e)}>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={
                        files.length > 0 &&
                        files.every((f) => f.type === 'directory' || selectedFiles.has(f.path))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFiles(
                            new Set(files.filter((f) => f.type === 'file').map((f) => f.path))
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
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.path}
                    data-file-name={file.name}
                    onDoubleClick={() => handleDoubleClick(file)}
                    onContextMenu={(e) => {
                      e.stopPropagation()
                      handleContextMenu(e, file.name)
                    }}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedFiles.has(file.path)
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                        : ''
                    } ${
                      highlightedItem === file.name
                        ? 'bg-green-100 dark:bg-green-900/30 animate-pulse'
                        : ''
                    }`}
                  >
                    <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center space-x-3">
                        {file.type === 'file' && (
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={(e) => handleFileSelection(file.path, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="text-2xl">{file.type === 'directory' ? '📁' : '📄'}</span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {file.type === 'file' ? formatFileSize(file.size) : '-'}
                      </span>
                    </td>
                    <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(file.modified).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getContextMenuItems()}
        onClose={closeContextMenu}
      />

      {/* Prompt Dialog */}
      <PromptDialog
        visible={promptDialog.visible}
        title={promptDialog.title}
        placeholder={promptDialog.placeholder}
        defaultValue={promptDialog.defaultValue}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </div>
  )
}

export default LocalFileExplorer
