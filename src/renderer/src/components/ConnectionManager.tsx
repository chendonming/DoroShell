import React, { useState, useEffect } from 'react'
import { notify } from '../utils/notifications'
import type { FTPCredentials, SavedFTPConnection } from '../../../types'

interface ConnectionManagerProps {
  isOpen: boolean
  onClose: () => void
  onConnect: (credentials: FTPCredentials) => Promise<void>
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({ isOpen, onClose, onConnect }) => {
  const [savedConnections, setSavedConnections] = useState<SavedFTPConnection[]>([])
  const [editingConnection, setEditingConnection] = useState<SavedFTPConnection | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<SavedFTPConnection & { password: string }>>({
    name: '',
    host: '',
    port: 21,
    username: '',
    password: '',
    protocol: 'ftp'
  })
  const [isConnecting, setIsConnecting] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSavedConnections()
    }
  }, [isOpen])

  const loadSavedConnections = (): void => {
    try {
      const saved = localStorage.getItem('ftpConnections')
      if (saved) {
        const connections: SavedFTPConnection[] = JSON.parse(saved)
        setSavedConnections(
          connections.sort(
            (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
          )
        )
      } else {
        // 如果没有保存的连接，创建一个示例连接供测试
        const defaultConnection: SavedFTPConnection = {
          id: 'test-001',
          name: 'Test FTP Server',
          host: 'test.rebex.net',
          port: 21,
          username: 'demo',
          password: 'password', // 添加默认密码
          protocol: 'ftp',
          lastUsed: new Date().toISOString()
        }
        setSavedConnections([defaultConnection])
        localStorage.setItem('ftpConnections', JSON.stringify([defaultConnection]))
      }
    } catch (error) {
      console.error('Failed to load saved connections:', error)
    }
  }

  const saveConnection = (): void => {
    if (!formData.name || !formData.host || !formData.username || !formData.password) {
      notify('Please fill in all required fields including password', 'info')
      return
    }

    try {
      const connection: SavedFTPConnection = {
        id: editingConnection?.id || Date.now().toString(),
        name: formData.name!,
        host: formData.host!,
        port: formData.port || 21,
        username: formData.username!,
        password: formData.password!, // 保存密码
        protocol: formData.protocol as 'ftp' | 'sftp',
        lastUsed: editingConnection?.lastUsed || new Date().toISOString()
      }

      const updatedConnections = [...savedConnections]

      if (editingConnection) {
        // Update existing
        const index = updatedConnections.findIndex((conn) => conn.id === editingConnection.id)
        if (index >= 0) {
          updatedConnections[index] = connection
        }
      } else {
        // Add new
        updatedConnections.push(connection)
      }

      localStorage.setItem('ftpConnections', JSON.stringify(updatedConnections))
      setSavedConnections(updatedConnections)
      resetForm()
    } catch (error) {
      console.error('Failed to save connection:', error)
      notify('Failed to save connection', 'error')
    }
  }

  const deleteConnection = (id: string): void => {
    if (confirm('Are you sure you want to delete this connection?')) {
      try {
        const updatedConnections = savedConnections.filter((conn) => conn.id !== id)
        localStorage.setItem('ftpConnections', JSON.stringify(updatedConnections))
        setSavedConnections(updatedConnections)
      } catch (error) {
        console.error('Failed to delete connection:', error)
      }
    }
  }

  const editConnection = (connection: SavedFTPConnection): void => {
    setEditingConnection(connection)
    setFormData({
      name: connection.name,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password, // 加载保存的密码
      protocol: connection.protocol
    })
    setShowForm(true)
  }

  const handleConnect = async (connection: SavedFTPConnection): Promise<void> => {
    setIsConnecting(connection.id)

    try {
      const credentials: FTPCredentials = {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password, // 直接使用保存的密码
        protocol: connection.protocol
      }

      await onConnect(credentials)

      // Update last used time
      const updatedConnections = savedConnections.map((conn) =>
        conn.id === connection.id ? { ...conn, lastUsed: new Date().toISOString() } : conn
      )
      localStorage.setItem('ftpConnections', JSON.stringify(updatedConnections))
      setSavedConnections(updatedConnections)

      onClose()
    } catch (error) {
      console.error('Connection failed:', error)
      notify(
        `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check your credentials and try again.`,
        'error'
      )
    } finally {
      setIsConnecting(null)
    }
  }

  const resetForm = (): void => {
    setEditingConnection(null)
    setFormData({
      name: '',
      host: '',
      port: 21,
      username: '',
      password: '',
      protocol: 'ftp'
    })
    setShowForm(false)
  }

  const handleInputChange = (field: string, value: string | number): void => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">连接管理器</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 p-2 rounded-md transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex h-[600px]">
          {/* Connection List */}
          <div className="flex-1 p-6 border-r border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">已保存的连接</h3>
              <button
                onClick={() => setShowForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                + 新建连接
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[500px]">
              {savedConnections.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <div className="text-4xl mb-2">🔌</div>
                  <p>没有已保存的连接</p>
                  <p className="text-sm">创建新连接以开始使用</p>
                </div>
              ) : (
                savedConnections.map((connection) => {
                  const disabled = isConnecting !== null && isConnecting !== connection.id
                  return (
                    <div
                      key={connection.id}
                      className={`rounded-lg p-4 transition-colors ${
                        disabled
                          ? 'bg-gray-100/60 dark:bg-gray-800/60 opacity-60'
                          : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {(() => {
                          const titleClass = disabled
                            ? 'font-medium text-gray-500 dark:text-gray-400'
                            : 'font-medium text-gray-900 dark:text-white'
                          const metaClass = disabled
                            ? 'text-sm text-gray-400 dark:text-gray-500'
                            : 'text-sm text-gray-600 dark:text-gray-400'
                          const wrapperCursor = disabled ? 'cursor-not-allowed' : 'cursor-pointer'

                          return (
                            <div
                              className={`flex-1 ${wrapperCursor}`}
                              onClick={disabled ? undefined : () => handleConnect(connection)}
                              aria-disabled={disabled}
                              title={disabled ? '正在连接，请等待该连接完成后再操作' : undefined}
                            >
                              <div className={titleClass}>{connection.name}</div>
                              <div className={metaClass}>
                                {connection.username}@{connection.host}:{connection.port} •{' '}
                                <span className="text-xs text-gray-500 dark:text-gray-500">
                                  {connection.protocol === 'sftp'
                                    ? 'SSH'
                                    : connection.protocol.toUpperCase()}{' '}
                                  • 最后使用: {new Date(connection.lastUsed).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          )
                        })()}

                        <div className="flex items-center space-x-2">
                          {isConnecting === connection.id && (
                            <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                          )}
                          <button
                            onClick={disabled ? undefined : () => editConnection(connection)}
                            className={`p-1 rounded transition-colors ${
                              disabled
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                            }`}
                            title={disabled ? '正在连接，暂不可编辑' : '编辑'}
                            aria-disabled={disabled}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={disabled ? undefined : () => deleteConnection(connection.id)}
                            className={`p-1 rounded transition-colors ${
                              disabled
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300'
                            }`}
                            title={disabled ? '正在连接，暂不可删除' : '删除'}
                            aria-disabled={disabled}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Connection Form */}
          {showForm && (
            <div className="w-96 p-6 bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingConnection ? '编辑连接' : '新建连接'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  saveConnection()
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    连接名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="FTP 服务器"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      协议
                    </label>
                    <select
                      value={formData.protocol || 'ftp'}
                      onChange={(e) => handleInputChange('protocol', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                    >
                      <option value="ftp">FTP</option>
                      <option value="sftp">SSH</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      端口
                    </label>
                    <input
                      type="number"
                      value={formData.port || 21}
                      onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                      min="1"
                      max="65535"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    主机地址 *
                  </label>
                  <input
                    type="text"
                    value={formData.host || ''}
                    onChange={(e) => handleInputChange('host', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="ftp.example.com 或 192.168.1.100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    用户名 *
                  </label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="用户名"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    密码 *
                  </label>
                  <input
                    type="password"
                    value={formData.password || ''}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="请输入密码"
                    required
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors"
                  >
                    {editingConnection ? '更新' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 py-2 px-4 rounded-md transition-colors"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConnectionManager
