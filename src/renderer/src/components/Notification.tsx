import React, { useEffect, useState } from 'react'
import { getItems, subscribe } from '../utils/notifications'
import type { NotificationItem } from '../utils/notifications'

export const Notifications: React.FC = () => {
  const [state, setState] = useState<NotificationItem[]>(getItems())

  useEffect(() => {
    const unsub = subscribe((updated) => setState([...updated]))
    return () => unsub()
  }, [])

  if (state.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {state.map((it) => (
        <div
          key={it.id}
          className={`min-w-[320px] max-w-xl w-full px-4 py-3 rounded shadow-lg text-sm text-white font-medium flex items-center gap-3 justify-center ${
            it.type === 'error'
              ? 'bg-red-600'
              : it.type === 'success'
                ? 'bg-green-600'
                : 'bg-blue-600'
          }`}
        >
          <span className="text-lg">
            {it.type === 'error' ? '❌' : it.type === 'success' ? '✅' : 'ℹ️'}
          </span>
          <span className="truncate">{it.message}</span>
        </div>
      ))}
    </div>
  )
}

export default Notifications
