import React, { useState, useRef, useEffect } from 'react'

interface PathInputProps {
  value: string
  onChange: (value: string) => void
  onNavigate: (path: string) => void
  placeholder?: string
  historyKey: string
  className?: string
}

const PathInput: React.FC<PathInputProps> = ({
  value,
  onChange,
  onNavigate,
  placeholder = '输入路径...',
  historyKey,
  className = ''
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [pathHistory, setPathHistory] = useState<string[]>([])
  const [filteredHistory, setFilteredHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem(`pathHistory_${historyKey}`)
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory)
        setPathHistory(history.slice(0, 50)) // 限制为最近50条
      } catch (error) {
        console.error('Failed to load path history:', error)
      }
    }
  }, [historyKey])

  // 过滤历史记录
  useEffect(() => {
    if (value.trim()) {
      const filtered = pathHistory.filter(
        (path) => path.toLowerCase().includes(value.toLowerCase()) && path !== value
      )
      setFilteredHistory(filtered.slice(0, 10)) // 最多显示10条匹配项
    } else {
      setFilteredHistory(pathHistory.slice(0, 10))
    }
  }, [value, pathHistory])

  // 保存路径到历史记录
  const saveToHistory = (path: string): void => {
    if (!path.trim()) return

    const newHistory = [path, ...pathHistory.filter((p) => p !== path)].slice(0, 50)
    setPathHistory(newHistory)
    localStorage.setItem(`pathHistory_${historyKey}`, JSON.stringify(newHistory))
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      const trimmedPath = value.trim()
      if (trimmedPath) {
        saveToHistory(trimmedPath)
        onNavigate(trimmedPath)
        setIsDropdownOpen(false)
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsDropdownOpen(true)
      // 可以添加键盘导航逻辑
    }
  }

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = e.target.value
    onChange(newValue)
    setIsDropdownOpen(true)
  }

  // 处理历史项点击
  const handleHistoryItemClick = (path: string): void => {
    onChange(path)
    onNavigate(path)
    setIsDropdownOpen(false)
    inputRef.current?.blur()
  }

  // 处理焦点和失焦
  const handleFocus = (): void => {
    setIsDropdownOpen(true)
  }

  const handleBlur = (e: React.FocusEvent): void => {
    // 延迟关闭，允许点击下拉项
    setTimeout(() => {
      if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
        setIsDropdownOpen(false)
      }
    }, 150)
  }

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative flex-1">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full pr-8 ${className}`}
          title="按 Enter 键导航到路径，按 Esc 键取消，点击下拉箭头查看历史"
        />
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          tabIndex={-1}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              isDropdownOpen ? 'transform rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 下拉历史列表 */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {filteredHistory.length > 0 ? (
            <div className="py-1">
              {filteredHistory.map((path, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleHistoryItemClick(path)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-mono"
                  title={path}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-400 dark:text-gray-500">📁</span>
                    <span className="truncate">{path}</span>
                  </div>
                </button>
              ))}
              {pathHistory.length > filteredHistory.length && (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600">
                  {value.trim()
                    ? `显示 ${filteredHistory.length} 条匹配项`
                    : `显示最近 ${filteredHistory.length} 条，共 ${pathHistory.length} 条历史`}
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
              {value.trim() ? '无匹配的历史路径' : '暂无历史路径'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PathInput
