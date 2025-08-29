import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    // 如果 preload 中暴露了 ssh 对象，则其类型为下述接口
    // 具体方法：connect, disconnect, send, onData
  }
}
