import React, { useState } from 'react'
import type { FTPCredentials } from '../../../types'

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

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsConnecting(true)

    try {
      await onConnect(credentials)
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 animate-slide-in">
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label
                htmlFor="protocol"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Protocol
              </label>
              <select
                id="protocol"
                value={credentials.protocol}
                onChange={(e) => handleInputChange('protocol', e.target.value as 'ftp' | 'sftp')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                <option value="ftp">FTP</option>
                <option value="sftp">SFTP</option>
              </select>
            </div>

            <div className="form-group">
              <label
                htmlFor="port"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Port
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
              Server Address
            </label>
            <input
              type="text"
              id="host"
              value={credentials.host}
              onChange={(e) => handleInputChange('host', e.target.value)}
              placeholder="ftp.example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              value={credentials.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="your-username"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={credentials.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="your-password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
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
                Connecting...
              </div>
            ) : (
              'Connect to Server'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Make sure your FTP server is running and accessible
          </p>
        </div>
      </div>
    </div>
  )
}

export default FTPConnection
