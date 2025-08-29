import React, { useState, useEffect, useRef, useCallback } from 'react'

// FontPicker component defined at module scope to avoid remounts that cause input blur
const FontPicker: React.FC<{
  id: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  theme: 'dark' | 'light'
}> = ({ id, value, onChange, options, placeholder, theme }) => {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const filtered = value
    ? options.filter((f) => f.toLowerCase().includes(value.toLowerCase()))
    : options

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlight(-1)
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  const selectAt = useCallback(
    (idx: number) => {
      if (idx >= 0 && idx < filtered.length) {
        onChange(filtered[idx])
      }
      setOpen(false)
      setHighlight(-1)
    },
    [filtered, onChange]
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0) {
        e.preventDefault()
        selectAt(highlight)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
      />

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className={
            `absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-auto rounded border shadow-lg ` +
            (theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-white'
              : 'bg-white border-gray-200 text-gray-900')
          }
        >
          {filtered.map((f, idx) => (
            <li
              key={f}
              role="option"
              aria-selected={highlight === idx}
              onMouseDown={(ev) => {
                // use onMouseDown to prevent blur before click
                ev.preventDefault()
                selectAt(idx)
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={`px-3 py-2 cursor-pointer ${highlight === idx ? (theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100') : ''}`}
            >
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Props = {
  onClose: () => void
  theme: 'dark' | 'light'
  onChangeTheme: (theme: 'dark' | 'light') => void
  fontPrimary: string
  fontFallback: string
  onChangeFonts: (primary: string, fallback: string) => void
}

const SettingsPanel: React.FC<Props> = ({
  onClose,
  theme,
  onChangeTheme,
  fontPrimary,
  fontFallback,
  onChangeFonts
}) => {
  const [localTheme, setLocalTheme] = useState<'dark' | 'light'>(theme)
  const [primary, setPrimary] = useState(fontPrimary || '')
  const [fallback, setFallback] = useState(fontFallback || '')
  const [availableFonts, setAvailableFonts] = useState<string[]>([])

  useEffect(() => {
    // 获取系统字体列表（如果可用）
    ;(async () => {
      try {
        if (window.api && (window.api as any).system && (window.api as any).system.getFonts) {
          const res = await (window.api as any).system.getFonts()
          if (res && res.success && Array.isArray(res.fonts)) setAvailableFonts(res.fonts)
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    setLocalTheme(theme)
  }, [theme])

  useEffect(() => {
    setPrimary(fontPrimary || '')
    setFallback(fontFallback || '')
  }, [fontPrimary, fontFallback])

  const apply = (): void => {
    onChangeTheme(localTheme)
    onChangeFonts(primary.trim(), fallback.trim())
    onClose()
  }

  return (
    <div className="w-full">
      <div className="p-2">
        <div className="relative w-full bg-white dark:bg-gray-800 rounded-md p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                主题
              </label>
              <select
                value={localTheme}
                onChange={(e) => setLocalTheme(e.target.value as 'dark' | 'light')}
                className="w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
              >
                <option value="dark">深色</option>
                <option value="light">浅色</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                主字体（可搜索/选择或手动输入）
              </label>
              <FontPicker
                id="font-primary"
                value={primary}
                onChange={setPrimary}
                options={availableFonts}
                placeholder="输入以搜索或直接选择字体"
                theme={localTheme}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                回退字体（可搜索/选择或输入通用回退，如 sans-serif）
              </label>
              <FontPicker
                id="font-fallback"
                value={fallback}
                onChange={setFallback}
                options={[...availableFonts, 'sans-serif', 'serif', 'monospace']}
                placeholder="输入以搜索或选择回退字体，例如 sans-serif"
                theme={localTheme}
              />
            </div>
          </div>

          {/* 实时预览区域 */}
          <div className="mt-4">
            {/* 使用明确的暗/亮类，确保深色模式下文本可读 */}
            <div
              className={
                `p-3 rounded border text-sm ` +
                (localTheme === 'dark'
                  ? 'bg-gray-900 border-gray-800 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-900')
              }
              style={{
                fontFamily: primary ? primary + (fallback ? ', ' + fallback : '') : undefined
              }}
            >
              示例：这是字体预览 — The quick brown fox jumps over the lazy dog.
            </div>
          </div>

          <div className="mt-4 text-gray-700 dark:text-gray-200">
            关于
            <a href="https://nikke-goddess-of-victory-international.fandom.com/wiki/Dorothy" target="_blank" rel="noreferrer" className="text-blue-600 underline ml-1">
              Doro
            </a>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
            >
              取消
            </button>
            <button onClick={apply} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm">
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
