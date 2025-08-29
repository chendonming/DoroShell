import { createContext } from 'react'

export type ConfirmContextType = {
  confirm: (options: {
    message: string
    title?: string
    confirmText?: string
    cancelText?: string
  }) => Promise<boolean>
}

export const ConfirmContext = createContext<ConfirmContextType | null>(null)

export default ConfirmContext
