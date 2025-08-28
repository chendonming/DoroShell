import React, { useState, useEffect, useRef } from 'react'

interface PromptDialogProps {
  visible: boolean
  title: string
  placeholder?: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

const PromptDialog: React.FC<PromptDialogProps> = ({
  visible,
  title,
  placeholder = '',
  defaultValue = '',
  onConfirm,
  onCancel
}) => {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setValue(defaultValue)
      // 延迟聚焦以确保对话框已显示
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [visible, defaultValue])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const handleConfirm = (): void => {
    if (value.trim()) {
      onConfirm(value.trim())
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-96 max-w-sm mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        />

        <div className="flex justify-end space-x-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromptDialog
