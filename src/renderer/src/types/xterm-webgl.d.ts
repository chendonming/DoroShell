declare module '@xterm/addon-webgl' {
  import type { Terminal as XTermTerminal } from '@xterm/xterm'
  export class WebglAddon {
    constructor(options?: { preserveDrawingBuffer?: boolean })
    dispose(): void
    activate(terminal: XTermTerminal): void
  }
  export default WebglAddon
}
