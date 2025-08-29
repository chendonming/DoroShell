import React, { useState, useEffect } from 'react'
import type { FTPCredentials, SavedFTPConnection } from '../../../types'

interface FTPConnectionProps {
  onConnect: (credentials: FTPCredentials) => Promise<void>
}

const FTPConnection: React.FC<FTPConnectionProps> = ({ onConnect }) => {
  const [credentials, setCredentials] = useState<FTPCredentials>({
    host: '',
    port: 21,
    username: '',
    password: '',
    protocol: 'ftp'
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [savedConnections, setSavedConnections] = useState<SavedFTPConnection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [saveConnection, setSaveConnection] = useState(false)
  const [connectionName, setConnectionName] = useState('')
  const [showSavedConnections, setShowSavedConnections] = useState(false)

  useEffect(() => {
    loadSavedConnections()
  }, [])

  const loadSavedConnections = (): void => {
    try {
      const saved = localStorage.getItem('ftpConnections')
      if (saved) {
        const connections: SavedFTPConnection[] = JSON.parse(saved)
        setSavedConnections(connections)
        setShowSavedConnections(connections.length > 0)
      }
    } catch (error) {
      console.error('Failed to load saved connections:', error)
    }
  }

  const saveConnectionToStorage = (creds: FTPCredentials, name: string): void => {
    try {
      const newConnection: SavedFTPConnection = {
        id: Date.now().toString(),
        name: name || `${creds.username}@${creds.host}`,
        host: creds.host,
        port: creds.port,
        username: creds.username,
        password: creds.password, // 保存密码以便一键登录
        protocol: creds.protocol,
        lastUsed: new Date().toISOString()
      }

      const existingConnections = [...savedConnections]
      const existingIndex = existingConnections.findIndex(
        (conn) => conn.host === creds.host && conn.username === creds.username
      )

      if (existingIndex >= 0) {
        // 更新现有连接
        existingConnections[existingIndex] = {
          ...newConnection,
          id: existingConnections[existingIndex].id
        }
      } else {
        // 添加新连接
        existingConnections.push(newConnection)
      }

      // 按最后使用时间排序
      existingConnections.sort(
        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      )

      localStorage.setItem('ftpConnections', JSON.stringify(existingConnections))
      setSavedConnections(existingConnections)
      setShowSavedConnections(true)
    } catch (error) {
      console.error('Failed to save connection:', error)
    }
  }

  const loadSavedConnection = (connectionId: string): void => {
    const connection = savedConnections.find((conn) => conn.id === connectionId)
    if (connection) {
      setCredentials({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password, // 加载保存的密码
        protocol: connection.protocol
      })
      setSelectedConnectionId(connectionId)
      setConnectionName(connection.name)
    }
  }

  const deleteSavedConnection = (connectionId: string): void => {
    try {
      const updatedConnections = savedConnections.filter((conn) => conn.id !== connectionId)
      localStorage.setItem('ftpConnections', JSON.stringify(updatedConnections))
      setSavedConnections(updatedConnections)
      setShowSavedConnections(updatedConnections.length > 0)

      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId('')
        setCredentials({
          host: '',
          port: 21,
          username: '',
          password: '',
          protocol: 'ftp'
        })
      }
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsConnecting(true)

    try {
      await onConnect(credentials)

      // 连接成功后保存配置
      if (saveConnection) {
        const name = connectionName.trim() || `${credentials.username}@${credentials.host}`
        saveConnectionToStorage(credentials, name)
      }
    } catch (error) {
      console.error('Connection failed:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleInputChange = (field: keyof FTPCredentials, value: string | number): void => {
    setCredentials((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-2xl mx-4 animate-slide-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Connect to FTP Server
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Enter your server details to establish connection
          </p>
        </div>

        {/* Saved Connections */}
        {showSavedConnections && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Saved Connections
              </h3>
              <button
                onClick={() => setShowSavedConnections(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {savedConnections.map((connection) => (
                <div
                  key={connection.id}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedConnectionId === connection.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                  onClick={() => loadSavedConnection(connection.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {connection.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {connection.username}@{connection.host}:{connection.port} (
                        {connection.protocol.toUpperCase()})
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        最后使用: {new Date(connection.lastUsed).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSavedConnection(connection.id)
                      }}
                      className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded transition-colors"
                      title="删除连接"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showSavedConnections && savedConnections.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowSavedConnections(true)}
              className="w-full p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              📁 显示已保存的连接 ({savedConnections.length})
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label
                htmlFor="protocol"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                协议
              </label>
              <select
                id="protocol"
                value={credentials.protocol}
                onChange={(e) => handleInputChange('protocol', e.target.value as 'ftp' | 'sftp')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                <option value="ftp">FTP</option>
                <option value="sftp">SSH</option>
              </select>
            </div>

            <div className="form-group">
              <label
                htmlFor="port"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                端口
              </label>
              <input
                type="number"
                id="port"
                value={credentials.port}
                onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                placeholder="21"
                min="1"
                max="65535"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label
              htmlFor="host"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              服务器地址
            </label>
            <input
              type="text"
              id="host"
              value={credentials.host}
              onChange={(e) => handleInputChange('host', e.target.value)}
              placeholder="ftp.example.com 或 192.168.1.100"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              用户名
            </label>
            <input
              type="text"
              id="username"
              value={credentials.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="请输入用户名"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              密码
            </label>
            <input
              type="password"
              id="password"
              value={credentials.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="请输入密码"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          {/* Save Connection Options */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="saveConnection"
                checked={saveConnection}
                onChange={(e) => setSaveConnection(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="saveConnection"
                className="ml-2 text-sm text-gray-700 dark:text-gray-300"
              >
                保存此连接以便快速访问
              </label>
            </div>

            {saveConnection && (
              <div className="form-group">
                <label
                  htmlFor="connectionName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  连接名称 (可选)
                </label>
                <input
                  type="text"
                  id="connectionName"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder={
                    credentials.username && credentials.host
                      ? `${credentials.username}@${credentials.host}`
                      : 'FTP 服务器'
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isConnecting ? (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                正在连接...
              </div>
            ) : (
              '连接到服务器'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            请确保您的 FTP 服务器正在运行且可访问
          </p>
        </div>
      </div>
    </div>
  )
}

export default FTPConnection
