import React, { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
  icon?: string
}

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ visible, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)

  // 直接计算菜单位置，避免使用useState导致的闪烁
  const calculatePosition = () => {
    // 更精确地估算菜单尺寸
    let estimatedHeight = 16 // 基础padding (py-1 = 8px * 2)

    items.forEach((item) => {
      if (item.separator) {
        estimatedHeight += 9 // 分隔线高度 (h-px + my-1 = 1px + 8px)
      } else {
        estimatedHeight += 36 // 每个按钮项目约36px高度 (py-2 = 16px + text height)
      }
    })

    const estimatedWidth = 192 // min-w-48 约为192px

    let adjustedX = x
    let adjustedY = y

    // 检查右边界
    if (x + estimatedWidth > window.innerWidth) {
      adjustedX = x - estimatedWidth
    }

    // 检查底边界
    if (y + estimatedHeight > window.innerHeight) {
      adjustedY = y - estimatedHeight
    }

    // 确保不超出左边界和上边界
    if (adjustedX < 0) adjustedX = 0
    if (adjustedY < 0) adjustedY = 0

    return { x: adjustedX, y: adjustedY }
  }

  const position = calculatePosition()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg py-1 min-w-48"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.separator ? (
            <div className="h-px bg-gray-200 dark:bg-gray-600 my-1" />
          ) : (
            <button
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 ${
                item.disabled
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-200 cursor-pointer'
              }`}
              onClick={() => {
                if (!item.disabled && item.action) {
                  item.action()
                  onClose()
                }
              }}
              disabled={item.disabled}
            >
              {item.icon && <span className="text-base">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default ContextMenu
