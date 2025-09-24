import React, { useState, useEffect, useCallback } from 'react'
import useConfirm from '../hooks/useConfirm'
import type { TransferItem } from '../../../types'
import ContextMenu from './ContextMenu'
import PromptDialog from './PromptDialog'
import PathInput from './PathInput'
import { notify } from '../utils/notifications'
import type { PathInputHandle } from './PathInput'

interface LocalFileExplorerProps {
  onAddTransfer: (transfer: TransferItem) => void
  onUpdateTransferStatus: (id: string, status: TransferItem['status']) => void
  onCurrentPathChange: (path: string) => void
  onOpenLocalTerminal?: (cwd: string) => void
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
  onUpdateTransferStatus,
  onCurrentPathChange,
  onOpenLocalTerminal
}) => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')
  const [inputPath, setInputPath] = useState<string>('')
  const pathInputRef = React.useRef<PathInputHandle | null>(null)
  // 输入框临时值，只有在用户按 Enter 或选择历史项时才触发真正的导航
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

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
  const confirm = useConfirm()
  // batch-level overwrite decision: 'yesToAll' | 'noToAll' | null
  const batchOverwriteRef = React.useRef<'yesToAll' | 'noToAll' | null>(null)
  const [overwriteDialog, setOverwriteDialog] = useState<{
    visible: boolean
    fileName: string
    resolver?: (val: 'yes' | 'no' | 'yesToAll' | 'noToAll') => void
  }>({ visible: false, fileName: '' })

  const askOverwrite = (fileName: string): Promise<'yes' | 'no' | 'yesToAll' | 'noToAll'> => {
    return new Promise((resolve) => {
      setOverwriteDialog({ visible: true, fileName, resolver: resolve })
    })
  }

  const updateCurrentPath = useCallback(
    (newPath: string): void => {
      setCurrentPath(newPath)
      onCurrentPathChange(newPath)
      // 保存到历史并刷新 PathInput
      try {
        const key = `pathHistory_local`
        const saved = localStorage.getItem(key)
        const arr = saved ? JSON.parse(saved) : []
        const newArr = [newPath, ...arr.filter((p: string) => p !== newPath)].slice(0, 50)
        localStorage.setItem(key, JSON.stringify(newArr))
        try {
          pathInputRef.current?.refresh?.()
        } catch {
          // ignore
        }
      } catch (e) {
        console.error('保存本地历史失败', e)
      }
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

  // 当 currentPath 变化时同步输入框显示
  useEffect(() => {
    setInputPath(currentPath)
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
        // 在渲染层再次确保排序：目录优先，然后按首字母（不区分大小写）排序
        const sorted = [...result.files].sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        })
        setFiles(sorted)
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

  const handlePathNavigation = async (newPath: string): Promise<void> => {
    try {
      // 尝试读取目录来检查路径是否存在
      const result = await window.api.fs.readDirectory(newPath)
      if (result.success) {
        updateCurrentPath(newPath)
      } else {
        notify('路径不存在或无法访问', 'error')
        try {
          pathInputRef.current?.focus?.()
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.error('Failed to navigate to path:', error)
      notify('无法访问指定路径', 'error')
      try {
        pathInputRef.current?.focus?.()
      } catch {
        // ignore
      }
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
    // 优先使用 checkbox 选中的项
    let targets: string[] = []
    if (selectedFiles.size > 0) {
      targets = Array.from(selectedFiles)
    } else if (contextMenu.target) {
      targets = [contextMenu.target]
    }

    if (targets.length === 0) {
      notify('请选择要删除的文件', 'info')
      return
    }

    // 构建更详细的确认信息：数量、是否包含目录、总大小与若干示例文件名
    let countFiles = 0
    let countDirs = 0
    let totalSize = 0
    const sampleNames: string[] = []
    for (const p of targets) {
      const f = files.find((x) => x.path === p || x.name === p)
      if (f) {
        if (f.type === 'directory') countDirs++
        else {
          countFiles++
          totalSize += f.size || 0
        }
        if (sampleNames.length < 5) sampleNames.push(f.name)
      }
    }

    const parts: string[] = []
    parts.push(`共 ${targets.length} 项`)
    if (countFiles > 0) parts.push(`${countFiles} 个文件`)
    if (countDirs > 0) parts.push(`${countDirs} 个文件夹`)
    if (totalSize > 0) parts.push(`总大小 ${formatFileSize(totalSize)}`)
    const summary = parts.join('，')
    const examples = sampleNames.length > 0 ? `示例：${sampleNames.join('、')}` : ''

    const ok = await confirm({
      message: `${summary}\n${examples}\n确定要删除这些项吗？`
    })
    if (!ok) return

    try {
      for (const target of targets) {
        const file = files.find((f) => f.path === target || f.name === target)
        const name = file?.name || target
        const fullPath = await window.api.path.joinPath(currentPath, name)
        const stats = await window.api.fs.getFileStats(fullPath)

        if (stats.success && stats.stats?.isDirectory) {
          const result = await window.api.fs.deleteDirectory(fullPath)
          console.log('[Renderer] deleteDirectory result ->', { fullPath, result })
          if (!result.success) {
            notify(`删除文件夹 "${name}" 失败: ${result.error}`, 'error')
            continue
          }
        } else {
          const result = await window.api.fs.deleteFile(fullPath)
          console.log('[Renderer] deleteFile result ->', { fullPath, result })
          if (!result.success) {
            notify(`删除文件 "${name}" 失败: ${result.error}`, 'error')
            continue
          }
        }
      }

      // 清空选中状态并刷新
      setSelectedFiles(new Set())
      handleRefresh()
    } catch (error) {
      console.error('删除操作失败:', error)
      notify('删除失败', 'error')
    }
  }

  const handleUpload = async (): Promise<void> => {
    // 重置批次级决策，确保每次上传都重新询问用户
    batchOverwriteRef.current = null

    // 支持文件和文件夹同时勾选：文件直接上传，文件夹递归读取并上传其中的文件，保留目录结构
    const selected = files.filter((f) => selectedFiles.has(f.path))

    if (selected.length === 0) {
      notify('请选择要上传的文件或文件夹', 'info')
      return
    }

    console.log('[Renderer] LocalFileExplorer handleUpload called ->', { currentPath, selected })

    // 获取当前远端路径，作为上传目标的基准
    let remoteCurrentPath = '/'
    try {
      const p = await window.api.ftp.getCurrentPath()
      if (p && typeof p === 'string') remoteCurrentPath = p
    } catch (err) {
      console.warn('Failed to get remote current path, default to /', err)
    }

    const joinRemote = (base: string, sub: string): string => {
      if (!base || base === '/') return `/${sub}`
      return `${base}/${sub}`
    }

    const uploads: Array<{
      localPath: string
      remotePath: string
      name: string
      size: number
      id: string
    }> = []
    const seen = new Set<string>()

    const normalize = (p: string): string => p.replace(/\\/g, '/')

    // 为本次批量上传生成唯一 batchId，FTPManager 将基于此合并刷新
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    for (const item of selected) {
      if (item.type === 'file') {
        if (!seen.has(item.path)) {
          const targetRemote = joinRemote(remoteCurrentPath, item.name)
          const id = `upload-${Date.now()}-${Math.random()}`

          uploads.push({
            localPath: item.path,
            remotePath: targetRemote,
            name: item.name,
            size: item.size,
            id
          })
          seen.add(item.path)

          // 立即添加传输，状态为 'preparing'
          onAddTransfer({
            id,
            filename: item.name,
            size: item.size,
            progress: 0,
            status: 'preparing',
            type: 'upload',
            localPath: item.path,
            remotePath: targetRemote,
            batchId
          })
        }
      } else {
        // 递归读取目录内容
        const rootPath = item.path
        const rootName = item.name

        const stack = [rootPath]

        while (stack.length > 0) {
          // 弹出一个目录并读取其条目
          // 注意：这里按顺序读取，避免一次性递归造成大量并发
          const dir = stack.pop()!
          try {
            const res = await window.api.fs.readDirectory(dir)
            if (res.success && res.files) {
              for (const child of res.files) {
                const childPath = child.path
                if (child.type === 'file') {
                  if (!seen.has(childPath)) {
                    // 计算相对于选中根目录的相对路径，用于在远端恢复目录结构
                    const rel = normalize(childPath).startsWith(normalize(rootPath) + '/')
                      ? normalize(childPath).slice(normalize(rootPath).length + 1)
                      : child.name
                    const remoteRel = `${rootName}/${rel}`
                    const targetRemote = joinRemote(remoteCurrentPath, remoteRel)
                    const id = `upload-${Date.now()}-${Math.random()}`

                    uploads.push({
                      localPath: childPath,
                      remotePath: targetRemote,
                      name: child.name,
                      size: child.size,
                      id
                    })
                    seen.add(childPath)

                    // 立即添加传输，状态为 'preparing'
                    onAddTransfer({
                      id,
                      filename: child.name,
                      size: child.size,
                      progress: 0,
                      status: 'preparing',
                      type: 'upload',
                      localPath: childPath,
                      remotePath: targetRemote,
                      batchId
                    })
                  }
                } else if (child.type === 'directory') {
                  stack.push(childPath)
                }
              }
            }
          } catch (err) {
            console.error('读取目录失败:', dir, err)
          }
        }
      }
    }

    // 异步处理覆盖检查 - 按目录批量检查以优化性能
    const dirGroups = new Map<string, typeof uploads>()

    // 按父目录分组上传项
    for (const upload of uploads) {
      const idx = upload.remotePath.lastIndexOf('/')
      const parentDir = idx > 0 ? upload.remotePath.slice(0, idx) : '/'
      if (!dirGroups.has(parentDir)) {
        dirGroups.set(parentDir, [])
      }
      dirGroups.get(parentDir)!.push(upload)
    }

    // 为每个目录批量检查文件存在性
    for (const [parentDir, dirUploads] of dirGroups) {
      try {
        const listRes = await window.api.ftp.listDirectory(parentDir)

        if (listRes.success && Array.isArray(listRes.files)) {
          const remoteFiles = listRes.files
          const remoteFileNames = new Set(remoteFiles.map(f => f.name))

          // 检查此目录中的每个上传项
          for (const upload of dirUploads) {
            const exists = remoteFileNames.has(upload.name)
            if (exists) {
              // 先检查批次级决策
              if (batchOverwriteRef.current === 'noToAll') {
                onUpdateTransferStatus(upload.id, 'cancelled')
                continue
              }
              if (batchOverwriteRef.current === 'yesToAll') {
                // proceed
              } else {
                const decision = await askOverwrite(upload.name)
                if (decision === 'no') {
                  onUpdateTransferStatus(upload.id, 'cancelled')
                  continue
                }
                if (decision === 'yesToAll') batchOverwriteRef.current = 'yesToAll'
                if (decision === 'noToAll') {
                  batchOverwriteRef.current = 'noToAll'
                  onUpdateTransferStatus(upload.id, 'cancelled')
                  continue
                }
              }
            }

            // 开始上传
            onUpdateTransferStatus(upload.id, 'pending')
          }
        } else {
          // 目录不存在或无法访问，假设所有文件都不存在，直接开始上传
          for (const upload of dirUploads) {
            onUpdateTransferStatus(upload.id, 'pending')
          }
        }
      } catch (err) {
        // 如果检查失败（比如目录不存在），假设所有文件都不存在，直接开始上传
        console.warn(
          'Failed to check remote directory',
          parentDir,
          '- assuming files do not exist:',
          err
        )
        for (const upload of dirUploads) {
          onUpdateTransferStatus(upload.id, 'pending')
        }
      }
    }

    setSelectedFiles(new Set())
  }

  // 打开本地终端的处理函数
  const handleOpenTerminal = (): void => {
    if (onOpenLocalTerminal) {
      onOpenLocalTerminal(currentPath)
    }
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
              notify('创建文件失败: ' + result.error, 'error')
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
              notify('创建文件夹失败: ' + result.error, 'error')
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
                notify('重命名失败: ' + result.error, 'error')
              }
            }
          }
          break
      }
    } catch (error) {
      console.error('操作失败:', error)
      notify('操作失败', 'error')
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
      },
      { separator: true },
      {
        label: '在此处打开终端',
        action: handleOpenTerminal,
        icon: '💻'
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
        <div className="mt-2 flex items-center space-x-2">
          <button
            onClick={() => {
              if (currentPath && currentPath !== '/') {
                const parent = currentPath.split(/[/\\]/).slice(0, -1).join('/') || '/'
                updateCurrentPath(parent)
              }
            }}
            disabled={!currentPath || currentPath === '/'}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-sm transition-colors duration-200"
          >
            ⬆️ 上级
          </button>
          <PathInput
            value={inputPath}
            onChange={setInputPath}
            onNavigate={handlePathNavigation}
            placeholder="输入本地路径..."
            historyKey="local"
            ref={pathInputRef}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-sm transition-colors duration-200"
          >
            {loading ? '⟳' : '🔄'}
          </button>
          <button
            className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={async () => {
              try {
                const result = await window.api.path.showItemInFolder(currentPath)
                if (!result || !result.success) {
                  notify('在系统中打开失败: ' + (result?.error || '未知错误'), 'error')
                }
              } catch (error) {
                console.error('打开文件管理器失败:', error)
                notify('打开文件管理器失败', 'error')
              }
            }}
            title="在系统中打开"
          >
            📂 在系统中打开
          </button>
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
                      checked={files.length > 0 && files.every((f) => selectedFiles.has(f.path))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFiles(new Set(files.map((f) => f.path)))
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
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.path)}
                          onChange={(e) => handleFileSelection(file.path, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
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

      {/* Overwrite confirmation dialog for batch uploads */}
      {overwriteDialog.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 z-10 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              确认覆盖
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">
              远端已存在 {overwriteDialog.fileName}，是否覆盖？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setOverwriteDialog({ visible: false, fileName: '' })
                  overwriteDialog.resolver?.('no')
                }}
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                否
              </button>
              <button
                onClick={() => {
                  setOverwriteDialog({ visible: false, fileName: '' })
                  overwriteDialog.resolver?.('yes')
                }}
                className="px-3 py-1 rounded bg-blue-600 text-white"
              >
                是
              </button>
              <button
                onClick={() => {
                  setOverwriteDialog({ visible: false, fileName: '' })
                  overwriteDialog.resolver?.('yesToAll')
                }}
                className="px-3 py-1 rounded bg-green-600 text-white"
              >
                全部为是
              </button>
              <button
                onClick={() => {
                  setOverwriteDialog({ visible: false, fileName: '' })
                  overwriteDialog.resolver?.('noToAll')
                }}
                className="px-3 py-1 rounded bg-red-600 text-white"
              >
                全部为否
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocalFileExplorer
