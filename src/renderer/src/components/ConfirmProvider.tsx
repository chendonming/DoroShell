import React, { useState } from 'react'

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

import { ConfirmContext } from './confirm-context'

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<
    Array<{
      options: ConfirmOptions
      resolve: (value: boolean) => void
    }>
  >([])

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setQueue((q) => [...q, { options, resolve }])
    })
  }

  const handleResponse = (index: number, val: boolean): void => {
    setQueue((q) => {
      const item = q[index]
      if (item) {
        try {
          item.resolve(val)
        } catch {
          /* ignore */
        }
      }
      const newQ = q.slice(0, index).concat(q.slice(index + 1))
      return newQ
    })
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {/* render first queued confirm */}
      {queue.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 z-10 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold mb-2">{queue[0].options.title || '确认'}</h3>
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">
              {queue[0].options.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleResponse(0, false)}
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
              >
                {queue[0].options.cancelText || '取消'}
              </button>
              <button
                onClick={() => handleResponse(0, true)}
                className="px-3 py-1 rounded bg-blue-600 text-white"
              >
                {queue[0].options.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

// keep ConfirmProvider as the only component export from this file
