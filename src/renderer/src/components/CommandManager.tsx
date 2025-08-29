import React, { useEffect, useMemo, useState } from 'react'
import { useConfirm } from '../hooks/useConfirm'
import { notify } from '../utils/notifications'

interface CmdItem {
  id: string
  description: string
  command: string
}

const STORAGE_KEY = 'doro:commands:v1'

const loadCommands = (): CmdItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CmdItem[]
  } catch {
    return []
  }
}

const saveCommands = (items: CmdItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

const CommandManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<CmdItem[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [command, setCommand] = useState('')
  const commandInputRef = React.useRef<HTMLInputElement | null>(null)
  const formRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setItems(loadCommands())
  }, [])

  // debounce search input to avoid excessive filtering while typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const filteredItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const desc = (it.description || '').toLowerCase()
      const cmd = (it.command || '').toLowerCase()
      return desc.includes(q) || cmd.includes(q)
    })
  }, [items, debouncedSearch])

  const resetForm = (): void => {
    setEditingId(null)
    setDescription('')
    setCommand('')
  }

  const startEdit = (it: CmdItem): void => {
    setEditingId(it.id)
    setDescription(it.description)
    setCommand(it.command)
    // focus input and scroll form into view so user immediately knows they're editing
    setTimeout(() => {
      try {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        commandInputRef.current?.focus()
        commandInputRef.current?.select()
      } catch {
        /* ignore */
      }
    }, 30)
  }

  const handleSave = (): void => {
    if (!command.trim()) {
      notify('命令内容不能为空', 'info')
      return
    }

    if (editingId) {
      const updated = items.map((it) =>
        it.id === editingId ? { ...it, description, command } : it
      )
      setItems(updated)
      saveCommands(updated)
      notify('已保存命令', 'success')
    } else {
      const newItem: CmdItem = {
        id: Math.random().toString(36).substr(2, 9),
        description,
        command
      }
      const updated = [newItem, ...items]
      setItems(updated)
      saveCommands(updated)
      notify('已添加命令', 'success')
    }

    resetForm()
  }

  const cancelEdit = (): void => {
    resetForm()
  }

  const confirm = useConfirm()

  const handleDelete = async (id: string): Promise<void> => {
    const ok = await confirm({
      message: '确定删除该命令吗？',
      title: '删除命令',
      confirmText: '删除',
      cancelText: '取消'
    })
    if (!ok) return
    const updated = items.filter((it) => it.id !== id)
    setItems(updated)
    saveCommands(updated)
    notify('已删除命令', 'info')
  }

  const handleExport = (): void => {
    try {
      const ndjson = items
        .map((it) => JSON.stringify({ description: it.description, command: it.command }))
        .join('\n')
      const blob = new Blob([ndjson], { type: 'application/x-ndjson;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'doro-commands.ndjson'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify('已导出命令', 'success')
    } catch (err) {
      console.error(err)
      notify('导出失败', 'error')
    }
  }

  const handleImport = async (file?: File): Promise<void> => {
    if (!file) return
    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      const imported: CmdItem[] = []
      for (const ln of lines) {
        try {
          const obj = JSON.parse(ln)
          if (obj && typeof obj.command === 'string') {
            imported.push({
              id: Math.random().toString(36).substr(2, 9),
              description: obj.description || '',
              command: obj.command
            })
          }
        } catch {
          // ignore bad lines
        }
      }

      if (imported.length === 0) {
        notify('没有可导入的命令', 'info')
        return
      }

      // merge, but avoid duplicates by exact command match
      const existingCommands = new Set(items.map((i) => i.command))
      const toAdd = imported.filter((i) => !existingCommands.has(i.command))
      const updated = [...toAdd, ...items]
      setItems(updated)
      saveCommands(updated)
      notify(`已导入 ${toAdd.length} 条命令`, 'success')
    } catch (err) {
      console.error(err)
      notify('导入失败', 'error')
    }
  }

  const handleInject = (cmd: string): void => {
    try {
      window.dispatchEvent(new CustomEvent('doro:injectCommand', { detail: { command: cmd } }))
      notify('命令已注入终端输入（请在终端按 Enter 执行）', 'info')
      // 关闭命令管理面板（由父组件传入的 onClose）
      try {
        onClose()
      } catch {
        // ignore
      }
    } catch (err) {
      console.error(err)
      notify('注入失败', 'error')
    }
  }

  return (
    <div className="p-4 max-h-[70vh] flex flex-col">
  <div ref={formRef} className="mb-3 flex gap-2 bg-transparent/0">
        <input
          className="flex-1 border rounded px-2 py-1"
          placeholder="命令描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          ref={commandInputRef}
          className="flex-2 border rounded px-2 py-1"
          placeholder="命令内容，例如: ls -la"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button onClick={handleSave} className="bg-blue-600 text-white px-3 py-1 rounded">
          {editingId ? '保存修改' : '保存'}
        </button>
        {editingId ? (
          <button onClick={cancelEdit} className="bg-gray-200 px-3 py-1 rounded">
            取消编辑
          </button>
        ) : (
          <button onClick={resetForm} className="bg-gray-200 px-3 py-1 rounded">
            重置
          </button>
        )}
      </div>

  <div className="mb-3 flex gap-2 items-center bg-white/5 dark:bg-black/5 px-2 py-2 rounded shadow-sm border-b">
        <input
          className="flex-1 border rounded px-2 py-1"
          placeholder="按描述搜索（模糊）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="bg-gray-200 px-3 py-1 rounded"
            title="清除搜索"
          >
            清除
          </button>
        )}
        <button onClick={handleExport} className="bg-green-600 text-white px-3 py-1 rounded">
          导出 NDJSON
        </button>
        <label className="bg-white border px-3 py-1 rounded cursor-pointer">
          导入 NDJSON
          <input
            type="file"
            accept=".ndjson,application/x-ndjson,text/plain"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
        </label>
      </div>

  <div className="space-y-2 overflow-auto flex-1">
        {filteredItems.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">暂无命令，添加一些以便复用</div>
        )}
        {filteredItems.map((it) => (
          <div
            key={it.id}
            className={`border rounded p-2 flex items-start justify-between gap-2 ${
              editingId === it.id
                ? 'border-yellow-300 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10'
                : ''
            }`}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {it.description || <i className="text-gray-500 dark:text-gray-400">(无描述)</i>}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 break-all mt-1">
                {it.command}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-1">
                <button
                  onClick={() => handleInject(it.command)}
                  className="bg-indigo-600 text-white px-2 py-1 rounded text-sm"
                  title="注入到终端输入"
                >
                  注入
                </button>
                <button
                  onClick={() => startEdit(it)}
                  className="bg-yellow-400 text-black px-2 py-1 rounded text-sm"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(it.id)}
                  className="bg-red-500 text-white px-2 py-1 rounded text-sm"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CommandManager
