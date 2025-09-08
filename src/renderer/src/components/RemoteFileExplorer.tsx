import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react'
import useConfirm from '../hooks/useConfirm'
import type { PathInputHandle } from './PathInput'
import { notify } from '../utils/notifications'
import type { TransferItem } from '../../../types'
import PathInput from './PathInput'
import ContextMenu from './ContextMenu'
import PromptDialog from './PromptDialog'
// 本地上下文菜单项类型（与 ContextMenu.tsx 中定义的接口保持同步）
type CtxItem = {
  label?: string
  action?: () => void
  disabled?: boolean
  disabledReason?: string
  separator?: boolean
  icon?: string
}

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
  onOpenSSHTerminal?: () => void // 新增：打开SSH终端回调
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
  ({ onAddTransfer, onOpenSSHTerminal }, ref) => {
    const [remotePath, setRemotePath] = useState('/')
    const pathInputRef = useRef<PathInputHandle | null>(null)
    // 输入框的临时值，只有在用户按 Enter 或选择历史项时才触发真正的导航和目录刷新
    const [inputPath, setInputPath] = useState('/')
    const [files, setFiles] = useState<RemoteFileItem[]>([])
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [dragState, setDragState] = useState<DragState>({ isDragOver: false, dragDepth: 0 })
    const [overwriteDialog, setOverwriteDialog] = useState<OverwriteConfirmDialog>({
      visible: false,
      fileName: '',
      onConfirm: () => {}
    })
    // 使用 ref 来保存 overwriteAction 的即时值，避免在循环或异步回调中读取到过期的 state
    const overwriteActionRef = useRef<'yes' | 'no' | 'yesToAll' | 'noToAll' | null>(null)
    // 用一个简单的版本号 state 触发组件重渲染，以便 UI 能观察到 ref 的变化（如果需要显示在 UI 上）
    const [, setOverwriteActionVersion] = useState(0)
    // Context menu state
    const [ctxVisible, setCtxVisible] = useState(false)
    const [ctxX, setCtxX] = useState(0)
    const [ctxY, setCtxY] = useState(0)
    const [ctxItems, setCtxItems] = useState<CtxItem[]>([])
    const ctxTargetRef = useRef<RemoteFileItem | null>(null)
    const confirm = useConfirm()

    // 统一的排序函数：目录优先，然后按名称（不区分大小写）排序
    const sortRemoteFilesList = (list: RemoteFileItem[]): RemoteFileItem[] => {
      return list.slice().sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      })
    }

    const loadRemoteFiles = useCallback(async (): Promise<void> => {
      setLoading(true)
      try {
        const status = await window.api.ftp.getConnectionStatus()
        const isConnected = status?.connected ?? false
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

          setFiles(sortRemoteFilesList(remoteFiles))
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
      // 确保输入框与实际 remotePath 同步（例如初始或服务器恢复后）
      setInputPath(remotePath)

      // Load remote files when path changes
      const loadFiles = async (): Promise<void> => {
        setLoading(true)
        try {
          // 检查是否已连接
          const status = await window.api.ftp.getConnectionStatus()
          const isConnected = status?.connected ?? false
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
            setFiles(sortRemoteFilesList(remoteFiles))
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
      try {
        // 始终尝试切换目录，确保与服务器状态同步
        const result = await window.api.ftp.changeDirectory(newPath)
        if (result.success) {
          // 使用服务器返回的 currentPath（如果有）以避免路径格式差异
          const updatedPath = result.currentPath || newPath
          setRemotePath(updatedPath)
          // 同步输入框显示为服务器返回的路径
          setInputPath(updatedPath)
          setSelectedFiles(new Set())
          // 刷新 PathInput 历史展示 将在 remotePath 的 useEffect 中处理历史保存
        } else {
          console.error('无法切换到目录:', newPath, result.error)
          // 切换失败时，若服务端返回了当前路径则恢复本地显示，避免被卡在不可访问的路径
          if (result.currentPath) {
            setRemotePath(result.currentPath)
          }
          notify('无法访问指定路径', 'error')
          // alert 可能会导致输入丢失焦点，尝试恢复 PathInput 聚焦
          try {
            pathInputRef.current?.focus?.()
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.error('切换目录失败:', error)
        notify('切换目录失败', 'error')
        // 出现异常时尝试从服务端获取当前路径并同步本地状态
        try {
          const serverPath = await window.api.ftp.getCurrentPath()
          if (serverPath) setRemotePath(serverPath)
        } catch {
          // 忽略获取路径失败的错误
        }
        // 并尝试恢复 PathInput 聚焦
        try {
          pathInputRef.current?.focus?.()
        } catch {
          // ignore
        }
      }
    }

    // 将路径保存到历史（去重并限制 50 条），并尝试刷新 PathInput 的历史展示
    const addPathToHistory = (path: string): void => {
      try {
        const key = `pathHistory_remote`
        const saved = localStorage.getItem(key)
        const arr = saved ? JSON.parse(saved) : []
        const newArr = [path, ...arr.filter((p: string) => p !== path)].slice(0, 50)
        localStorage.setItem(key, JSON.stringify(newArr))
        try {
          pathInputRef.current?.refresh?.()
        } catch {
          // ignore
        }
      } catch (e) {
        console.error('保存历史失败', e)
      }
    }

    // 只要 remotePath 发生变化且看起来是有效路径，就记录历史
    useEffect(() => {
      if (remotePath && typeof remotePath === 'string') {
        addPathToHistory(remotePath)
      }
    }, [remotePath])

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

    const handleDrop = async (e: React.DragEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()

      setDragState({ isDragOver: false, dragDepth: 0 })

      // 打印原始 counts 帮助调试不同平台的 Drag 数据表现
      try {
        const itemsLength = e.dataTransfer?.items?.length ?? 0
        const filesLength = e.dataTransfer?.files?.length ?? 0
        console.log('[Renderer] handleDrop raw ->', { itemsLength, filesLength })

        const items = Array.from(e.dataTransfer.items || [])
        // 将 FileList 一并传入 processDroppedItems，便于后续合并补充
        await processDroppedItems(items, e.dataTransfer.files)
      } catch (error) {
        console.error('handleDrop error:', error)
      }
    }

    // 处理拖放的文件和文件夹
    const processDroppedItems = async (
      items: DataTransferItem[],
      fileList?: FileList
    ): Promise<void> => {
      const files: Array<{ file: File; path: string }> = []

      for (const item of items) {
        if (item.kind === 'file') {
          // 首选使用 FileSystemEntry（支持目录递归）
          const possibleEntry = item as unknown as { webkitGetAsEntry?: () => FileSystemEntry }
          const entry = possibleEntry.webkitGetAsEntry ? possibleEntry.webkitGetAsEntry() : null
          if (entry) {
            await processEntry(entry, '', files)
            continue
          }

          // 回退：尝试直接获取 File 对象（适用于大多数现代浏览器/环境）
          const file = (item as DataTransferItem).getAsFile()
          if (file) {
            files.push({ file, path: file.name })
            continue
          }
        }
      }

      // 如果 FileList 存在，合并其中未包含的文件（部分平台可能在 items 中缺失）
      if (fileList && fileList.length > 0) {
        for (const f of Array.from(fileList)) {
          if (!files.find((u) => u.file.name === f.name && u.file.size === f.size)) {
            files.push({ file: f, path: f.name })
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
      // 重置 ref，并触发一次重渲染以确保 UI 更新
      overwriteActionRef.current = null
      setOverwriteActionVersion((v) => v + 1)

      console.log('[Renderer] handleFileUploads called ->', {
        count: uploads.length,
        uploads: uploads.map((u) => ({ name: u.file.name, path: u.path }))
      })

      // Generate a batchId for this upload operation so FTPManager can
      // aggregate refreshes and other per-batch behaviors.
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      for (const upload of uploads) {
        await processUpload(upload, batchId)
      }

      // 清理 ref 并触发重渲染
      overwriteActionRef.current = null
      setOverwriteActionVersion((v) => v + 1)
    }

    // 处理单个文件上传
    const processUpload = async (
      upload: { file: File; path: string },
      batchId?: string
    ): Promise<void> => {
      const targetPath = remotePath === '/' ? `/${upload.path}` : `${remotePath}/${upload.path}`

      // 检查是否存在同名文件
      const existingFile = files.find((f) => f.name === upload.file.name)

      // 使用 ref 来判断，避免闭包/异步导致的过期 state
      if (existingFile && overwriteActionRef.current !== 'yesToAll') {
        if (overwriteActionRef.current === 'noToAll') {
          return // 跳过这个文件
        }

        // 显示覆盖确认对话框
        return new Promise((resolve) => {
          setOverwriteDialog({
            visible: true,
            fileName: upload.file.name,
            onConfirm: async (action) => {
              // 隐藏对话框
              setOverwriteDialog({ visible: false, fileName: '', onConfirm: () => {} })

              // 如果用户选择全部为是/否，同步更新 ref 并触发重渲染，保证后续判断即时生效
              if (action === 'yesToAll' || action === 'noToAll') {
                overwriteActionRef.current = action
                setOverwriteActionVersion((v) => v + 1)
              }

              if (action === 'yes' || action === 'yesToAll') {
                await performUpload(upload, targetPath, batchId)
              }

              resolve()
            }
          })
        })
      } else {
        // 没有冲突或者已经选择了全部覆盖
        await performUpload(upload, targetPath, batchId)
      }
    }

    // 执行实际的文件上传
    const performUpload = async (
      upload: { file: File; path: string },
      targetPath: string,
      batchId?: string
    ): Promise<void> => {
      try {
        // 添加到传输队列
        console.log('[Renderer] RemoteFileExplorer performUpload ->', {
          filename: upload.file.name,
          size: upload.file.size,
          targetPath,
          batchId
        })

        await onAddTransfer({
          type: 'upload',
          filename: upload.file.name,
          size: upload.file.size,
          remotePath: targetPath,
          draggedFile: upload.file, // 传递File对象给FTPManager处理
          batchId
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

    // Prompt dialog state (复用项目内 PromptDialog 以保持 UI 风格一致)
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

    const handlePromptConfirm = async (value: string): Promise<void> => {
      const { action } = promptDialog
      try {
        switch (action) {
          case 'createDirectory':
            {
              const result = await window.api.ftp.createDirectory(
                remotePath === '/' ? `/${value}` : `${remotePath}/${value}`
              )
              if (result.success) {
                await loadRemoteFiles()
                notify('创建目录成功', 'success')
              } else {
                notify('创建目录失败: ' + (result.error || '未知错误'), 'error')
              }
            }
            break
          case 'createFile':
            {
              // 使用 uploadDraggedFile 上传空内容以在远端创建一个空文件
              const filename = value.trim()
              if (!filename) {
                notify('文件名不能为空', 'info')
                break
              }

              try {
                const targetPath = remotePath === '/' ? `/${filename}` : `${remotePath}/${filename}`
                const emptyBuffer = new ArrayBuffer(0)
                const result = await window.api.ftp.uploadDraggedFile(
                  emptyBuffer,
                  filename,
                  targetPath
                )
                if (result.success) {
                  await loadRemoteFiles()
                  notify('创建文件成功', 'success')
                } else {
                  notify('创建文件失败: ' + (result.error || '未知错误'), 'error')
                }
              } catch (err) {
                console.error('createFile failed', err)
                notify('创建文件失败', 'error')
              }
            }
            break
          case 'rename':
            {
              const target = ctxTargetRef.current
              if (target) {
                const oldPath =
                  remotePath === '/' ? `/${target.name}` : `${remotePath}/${target.name}`
                const newPath = remotePath === '/' ? `/${value}` : `${remotePath}/${value}`
                const result = await window.api.ftp.renameFile(oldPath, newPath)
                if (result.success) {
                  await loadRemoteFiles()
                  notify('重命名成功', 'success')
                } else {
                  notify('重命名失败: ' + (result.error || '当前协议或连接不支持重命名'), 'error')
                }
              }
            }
            break
        }
      } catch (err) {
        console.error('操作失败', err)
        notify('操作失败', 'error')
      } finally {
        setPromptDialog({
          visible: false,
          title: '',
          placeholder: '',
          defaultValue: '',
          action: ''
        })
        closeContextMenu()
      }
    }

    const handlePromptCancel = (): void => {
      setPromptDialog({ visible: false, title: '', placeholder: '', defaultValue: '', action: '' })
      closeContextMenu()
    }

    const getContextMenuItems = (status: {
      connected: boolean
      protocols: Array<'ftp' | 'sftp' | 'ssh'>
    }): CtxItem[] => {
      const isConnected = status?.connected ?? false
      const protocols = status?.protocols ?? []
      // Only allow modify actions when we have a connection and a valid target/selection
      const canModify = isConnected && (!!ctxTargetRef.current || selectedFiles.size > 0)
      const hasSelectedFiles = selectedFiles.size > 0

      const items: CtxItem[] = [
        {
          label: '刷新',
          action: async () => {
            try {
              await loadRemoteFiles()
            } finally {
              closeContextMenu()
            }
          },
          icon: '🔄'
        },
        {
          label: '复制路径',
          action: () => {
            // 如果是对某个条目右键（ctxTargetRef），复制该条目的完整路径；否则复制当前 remotePath
            const target = ctxTargetRef.current
            const text = target
              ? remotePath === '/'
                ? `/${target.name}`
                : `${remotePath}/${target.name}`
              : remotePath
            navigator.clipboard
              .writeText(text)
              .then(() => console.log('路径已复制'))
              .catch((e) => console.error('复制失败', e))
            closeContextMenu()
          },
          disabled: ctxTargetRef.current ? false : selectedFiles.size !== 1,
          icon: '📋'
        },
        { separator: true }
      ]

      // 保持与本地资源管理器一致：创建文件（远程可能不支持，提示）
      items.push({
        label: '创建文件',
        action: () => {
          // 弹出创建文件输入框
          setPromptDialog({
            visible: true,
            title: '创建远程文件',
            placeholder: '请输入文件名',
            defaultValue: '',
            action: 'createFile'
          })
        },
        icon: '📄'
      })

      // 创建目录（远程）
      items.push({
        label: '创建文件夹',
        action: () => {
          setPromptDialog({
            visible: true,
            title: '创建远程文件夹',
            placeholder: '请输入文件夹名',
            defaultValue: '',
            action: 'createDirectory'
          })
        },
        icon: '📁'
      })

      items.push({ separator: true })

      items.push({
        label: '重命名',
        action: () => {
          const target = ctxTargetRef.current
          if (target) {
            setPromptDialog({
              visible: true,
              title: '重命名',
              placeholder: '请输入新名称',
              defaultValue: target.name,
              action: 'rename'
            })
          } else {
            notify('请选择目标重命名项', 'info')
          }
        },
        // 仅在单选时允许重命名
        disabled: !canModify || selectedFiles.size > 1,
        disabledReason: !isConnected
          ? '未连接到 FTP/SFTP，无法重命名'
          : protocols.length === 1 && protocols[0] === 'ssh'
            ? '仅通过 SSH shell 提供文件操作（兼容），请选择一个要重命名的项'
            : '请选择一个要重命名的项',
        icon: '✏️'
      })

      items.push({
        label: '删除',
        action: async () => {
          try {
            // 优先使用 checkbox 选中的项进行批量删除
            let targets: string[] = []
            if (selectedFiles.size > 0) {
              targets = Array.from(selectedFiles)
            } else if (ctxTargetRef.current) {
              targets = [ctxTargetRef.current.name]
            }

            if (targets.length === 0) {
              notify('请选择要删除的文件', 'info')
              closeContextMenu()
              return
            }

            // 构建详细统计信息
            let countFiles = 0
            let countDirs = 0
            let totalSize = 0
            const sampleNames: string[] = []
            for (const name of targets) {
              const f = files.find((x) => x.name === name)
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

            for (const t of targets) {
              const path = remotePath === '/' ? `/${t}` : `${remotePath}/${t}`
              // 先尝试删除为文件，否则删除目录
              const resFile = await window.api.ftp.deleteFile(path)
              if (!resFile.success) {
                const resDir = await window.api.ftp.deleteDirectory(path)
                if (!resDir.success) {
                  notify(`删除 ${t} 失败`, 'error')
                }
              }
            }

            await loadRemoteFiles()
          } catch (err) {
            console.error('删除失败', err)
            notify('删除失败', 'error')
          } finally {
            closeContextMenu()
          }
        },
        disabled: !canModify,
        disabledReason: !isConnected
          ? '未连接到 FTP/SFTP，无法删除'
          : protocols.length === 1 && protocols[0] === 'ssh'
            ? '仅通过 SSH shell 提供文件操作（兼容），删除可能失败'
            : '请选择要删除的项',
        icon: '🗑️'
      })

      items.push({ separator: true })

      // 下载（替代本地的上传）
      items.push({
        label: '下载',
        action: async () => {
          try {
            // 如果有选中项，则下载选中项；否则下载 ctxTarget
            const targets: RemoteFileItem[] = []
            if (selectedFiles.size > 0) {
              for (const name of selectedFiles) {
                const f = files.find((x) => x.name === name)
                if (f && f.type === 'file') targets.push(f)
              }
            } else if (ctxTargetRef.current) {
              if (ctxTargetRef.current.type === 'file') targets.push(ctxTargetRef.current)
            }

            if (targets.length === 0) {
              notify('请选择要下载的文件', 'info')
              return
            }

            for (const f of targets) {
              await onAddTransfer({
                filename: f.name,
                size: f.size,
                type: 'download',
                remotePath: remotePath === '/' ? `/${f.name}` : `${remotePath}/${f.name}`
              })
            }
          } catch (err) {
            console.error('下载失败', err)
            notify('下载失败', 'error')
          } finally {
            closeContextMenu()
          }
        },
        disabled: !(isConnected && (hasSelectedFiles || ctxTargetRef.current)),
        disabledReason: !isConnected
          ? '未连接到 FTP/SFTP，无法下载'
          : protocols.length === 1 && protocols[0] === 'ssh'
            ? '仅通过 SSH shell 提供文件操作（兼容），下载可能失败'
            : '请选择要下载的文件',
        icon: '⬇️'
      })

      // 添加分割线和终端选项
      items.push({ separator: true })

      // 打开SSH终端选项
      items.push({
        label: '打开SSH终端',
        action: () => {
          if (onOpenSSHTerminal) {
            onOpenSSHTerminal()
          } else {
            notify('功能暂未实现', 'info')
          }
          closeContextMenu()
        },
        disabled: !isConnected || !protocols.includes('ssh'),
        disabledReason: !isConnected
          ? '未连接到 FTP/SFTP，无法打开SSH终端'
          : !protocols.includes('ssh')
            ? '当前连接不支持SSH终端'
            : '',
        icon: '🔧'
      })

      return items
    }

    const handleContextMenu = (e: React.MouseEvent, file?: RemoteFileItem): void => {
      e.preventDefault()
      e.stopPropagation()
      ctxTargetRef.current = file || null
      setCtxX(e.clientX)
      setCtxY(e.clientY)
      // 查询当前连接状态，决定哪些菜单项可用
      window.api.ftp
        .getConnectionStatus()
        .then((status) => {
          setCtxItems(getContextMenuItems(status))
          setCtxVisible(true)
        })
        .catch(() => {
          // 如果查询失败，保守处理为未连接
          setCtxItems(getContextMenuItems({ connected: false, protocols: [] }))
          setCtxVisible(true)
        })
    }

    const closeContextMenu = (): void => {
      setCtxVisible(false)
      ctxTargetRef.current = null
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
              value={inputPath}
              onChange={setInputPath}
              onNavigate={navigateToPath}
              ref={pathInputRef}
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
        <div className="flex-1 overflow-auto" onContextMenu={(e) => handleContextMenu(e)}>
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
                      checked={files.length > 0 && files.every((f) => selectedFiles.has(f.name))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFiles(new Set(files.map((f) => f.name)))
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
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedFiles.has(file.name)
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                        : ''
                    }`}
                  >
                    <td className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.name)}
                          onChange={(e) => handleFileSelection(file.name, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
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

        {/* 右键菜单 */}
        <ContextMenu
          visible={ctxVisible}
          x={ctxX}
          y={ctxY}
          items={ctxItems}
          onClose={closeContextMenu}
        />

        {/* Prompt Dialog（复用项目内组件） */}
        <PromptDialog
          visible={promptDialog.visible}
          title={promptDialog.title}
          placeholder={promptDialog.placeholder}
          defaultValue={promptDialog.defaultValue}
          onConfirm={handlePromptConfirm}
          onCancel={handlePromptCancel}
        />

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
