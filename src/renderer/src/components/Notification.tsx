import React, { useEffect, useState } from 'react'

type NotificationType = 'info' | 'success' | 'error'

export interface NotificationItem {
  id: number
  type: NotificationType
  message: string
}

type Subscriber = (items: NotificationItem[]) => void

const subscribers: Subscriber[] = []
let items: NotificationItem[] = []
let nextId = 1

export const notify = (
  message: string,
  type: NotificationType = 'error',
  timeout = 4000
): number => {
  const id = nextId++
  const item: NotificationItem = { id, type, message }
  items = [item, ...items]
  subscribers.forEach((s) => s(items))

  if (timeout > 0) {
    setTimeout(() => {
      remove(id)
    }, timeout)
  }

  return id
}

export const remove = (id: number): void => {
  items = items.filter((i) => i.id !== id)
  subscribers.forEach((s) => s(items))
}

export const Notifications: React.FC = () => {
  const [state, setState] = useState<NotificationItem[]>(items)

  useEffect(() => {
    const sub: Subscriber = (updated) => setState([...updated])
    subscribers.push(sub)
    return () => {
      const idx = subscribers.indexOf(sub)
      if (idx >= 0) subscribers.splice(idx, 1)
    }
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
