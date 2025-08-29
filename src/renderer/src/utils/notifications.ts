export type NotificationType = 'info' | 'success' | 'error'

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

export const subscribe = (s: Subscriber): (() => void) => {
  subscribers.push(s)
  return () => {
    const idx = subscribers.indexOf(s)
    if (idx >= 0) subscribers.splice(idx, 1)
  }
}

export const getItems = (): NotificationItem[] => items
