import { useContext } from 'react'
import { ConfirmContext } from '../components/confirm-context'
import type { ConfirmContextType } from '../components/confirm-context'

export const useConfirmContext = (): ConfirmContextType => {
  const ctx = useContext(ConfirmContext) as ConfirmContextType | null
  if (!ctx) throw new Error('useConfirmContext must be used within ConfirmProvider')
  return ctx
}

export default useConfirmContext
