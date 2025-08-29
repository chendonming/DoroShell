import React from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children?: React.ReactNode
  className?: string
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 毛玻璃遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`relative w-[90%] max-w-3xl h-[70%] bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden ${className ?? ''}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1 rounded-md"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="h-full overflow-auto">{children}</div>
      </div>
    </div>
  )
}

export default Modal
