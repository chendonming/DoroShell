import { Client } from 'ssh2'
import { EventEmitter } from 'events'

export class SSHService extends EventEmitter {
  private conn: Client | null = null
  private _stream?: NodeJS.WritableStream

  connect(options: {
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (this.conn) {
        this.disconnect()
      }

      this.conn = new Client()

      this.conn.on('ready', () => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[ssh-service] connection ready')
        }
        // 使用 exec 先注入设置命令并执行一个登录 shell，这样设置命令不会在后续交互 shell 中被分片回显
        const ptyOpts = { term: 'xterm', cols: 80, rows: 24 }
        try {
          const cmd = `export PROMPT_COMMAND='DIR=$(basename "$PWD"); [ "$PWD" = "/" ] && DIR=""; PS1="[$(whoami)@$(hostname -s) \${DIR}]# "' ; exec /bin/bash -l`
          this.conn?.exec(cmd, { pty: ptyOpts }, (err, stream) => {
            if (err) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[ssh-service] exec open error ->', err.message)
              }
              resolve({ success: false, error: err.message })
              return
            }

            if (process.env.NODE_ENV === 'development') {
              console.debug('[ssh-service] exec opened')
            }

            let firstData = true
            stream.on('data', (chunk: Buffer) => {
              const s = chunk.toString()
              if (process.env.NODE_ENV === 'development') {
                if (firstData) {
                  console.debug('[ssh-service] first data preview ->', s.slice(0, 200))
                  firstData = false
                } else {
                  console.debug('[ssh-service] data preview ->', s.slice(0, 200))
                }
              }
              this.emit('data', s)
            })

            stream.on('close', () => {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[ssh-service] exec closed')
              }
              this.emit('close')
            })

            // 将 stream 保存到实例以便 send 使用
            this._stream = stream

            resolve({ success: true })
          })
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[ssh-service] exec launch error ->', err)
          }
          resolve({ success: false, error: String(err) })
        }
      })

      this.conn.on('error', (err) => {
        this.emit('error', err)
        resolve({ success: false, error: err.message })
      })

      this.conn.on('end', () => {
        this.emit('end')
      })

      const connectOpts: {
        host: string
        port: number
        username: string
        privateKey?: string
        password?: string
      } = {
        host: options.host,
        port: options.port || 22,
        username: options.username
      }
      if (options.privateKey) connectOpts.privateKey = options.privateKey
      if (options.password) connectOpts.password = options.password

      this.conn.connect(connectOpts)
    })
  }

  async disconnect(): Promise<void> {
    try {
      try {
        this._stream?.end?.()
      } catch {
        /* ignore stream end errors */
      }

      if (this.conn) {
        try {
          this.conn.end()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('ECONNRESET')) {
            console.warn('SSH disconnect ECONNRESET ignored')
          } else {
            console.error('SSH conn end error:', err)
          }
        }
      }
    } catch (error) {
      // guard against any unexpected errors during disconnect
      try {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn('SSH disconnect caught error ->', msg)
      } catch {
        /* ignore */
      }
    } finally {
      this.conn = null
    }
  }

  async send(data: string): Promise<void> {
    const stream = this._stream as unknown as NodeJS.WritableStream | undefined
    // WritableStream in Node may not provide `destroyed`; rely on try/catch
    if (!stream) throw new Error('SSH stream not available')
    //  @ts-ignore - Node stream write signature
    stream.write(data)
  }
}

export const sshService = new SSHService()
