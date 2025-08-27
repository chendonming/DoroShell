import React, { useState } from 'react'

interface FTPCredentials {
  host: string
  port: number
  username: string
  password: string
  protocol: 'ftp' | 'sftp'
}

interface FTPConnectionProps {
  onConnect: (credentials: FTPCredentials) => void
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

    // 模拟连接过程
    await new Promise((resolve) => setTimeout(resolve, 1000))

    onConnect(credentials)
    setIsConnecting(false)
  }

  const handleInputChange = (field: keyof FTPCredentials, value: string | number): void => {
    setCredentials((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="connection-container">
      <div className="connection-form">
        <div className="connection-header">
          <div className="connection-icon">
            <svg
              style={{ width: '2rem', height: '2rem', color: '#3b82f6' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="connection-title">Connect to FTP Server</h2>
          <p className="connection-subtitle">
            Enter your server credentials to establish a connection
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="protocol" className="form-label">
              Protocol
            </label>
            <select
              id="protocol"
              value={credentials.protocol}
              onChange={(e) => handleInputChange('protocol', e.target.value as 'ftp' | 'sftp')}
              className="form-input"
            >
              <option value="ftp">FTP</option>
              <option value="sftp">SFTP</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="host" className="form-label">
              Host
            </label>
            <input
              type="text"
              id="host"
              value={credentials.host}
              onChange={(e) => handleInputChange('host', e.target.value)}
              placeholder="ftp.example.com"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="port" className="form-label">
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
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={credentials.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="your-username"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={credentials.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="your-password"
              className="form-input"
              required
            />
          </div>

          <button type="submit" disabled={isConnecting} className="btn-primary">
            {isConnecting ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="spinner" style={{ marginRight: '0.75rem' }}></span>
                Connecting...
              </div>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        <div className="connection-note">
          <p className="connection-note-text">
            Make sure your FTP server is running and accessible
          </p>
        </div>
      </div>
    </div>
  )
}

export default FTPConnection
