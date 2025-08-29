import useConfirmContext from './useConfirmContext'

type ConfirmFn = (options: {
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
}) => Promise<boolean>

export const useConfirm = (): ConfirmFn => {
  const ctx = useConfirmContext()
  return ctx.confirm
}

export default useConfirm
