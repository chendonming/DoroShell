import React, { useState, useRef } from 'react'

interface FTPCredentials {
  host: string
  port: number
  username: string
  password: string
  protocol: 'ftp' | 'sftp'
}

interface FileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  permissions?: string
}

interface FileExplorerProps {
  credentials: FTPCredentials
  onUpload: (files: File[]) => void
}

const FileExplorer: React.FC<FileExplorerProps> = ({ credentials, onUpload }) => {
  const [localPath, setLocalPath] = useState('C:\\')
  const [remotePath, setRemotePath] = useState('/')
  const [localFiles] = useState<FileItem[]>([
    { name: 'Documents', type: 'directory', size: 0, modified: '2024-01-15' },
    { name: 'Downloads', type: 'directory', size: 0, modified: '2024-01-14' },
    { name: 'Pictures', type: 'directory', size: 0, modified: '2024-01-13' },
    { name: 'test.txt', type: 'file', size: 1024, modified: '2024-01-12' },
    { name: 'document.pdf', type: 'file', size: 2048000, modified: '2024-01-11' }
  ])
  const [remoteFiles] = useState<FileItem[]>([
    { name: 'www', type: 'directory', size: 0, modified: '2024-01-15' },
    { name: 'logs', type: 'directory', size: 0, modified: '2024-01-14' },
    { name: 'config.php', type: 'file', size: 5120, modified: '2024-01-13' },
    { name: 'index.html', type: 'file', size: 3072, modified: '2024-01-12' }
  ])
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<string[]>([])
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleFileSelect = (fileName: string, isLocal: boolean): void => {
    if (isLocal) {
      setSelectedLocalFiles((prev) =>
        prev.includes(fileName) ? prev.filter((f) => f !== fileName) : [...prev, fileName]
      )
    } else {
      setSelectedRemoteFiles((prev) =>
        prev.includes(fileName) ? prev.filter((f) => f !== fileName) : [...prev, fileName]
      )
    }
  }

  const handleUploadClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files
    if (files) {
      onUpload(Array.from(files))
    }
  }

  const FileList: React.FC<{
    files: FileItem[]
    selectedFiles: string[]
    onSelect: (fileName: string) => void
    title: string
    path: string
    onPathChange: (path: string) => void
  }> = ({ files, selectedFiles, onSelect, title, path, onPathChange }) => (
    <div className="file-panel">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
        <div className="path-input-container">
          <input
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            className="path-input"
          />
          <button className="btn-go" onClick={() => {}}>
            Go
          </button>
        </div>
      </div>

      <div className="file-table-container">
        <table className="file-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" />
              </th>
              <th>Name</th>
              <th>Size</th>
              <th>Modified</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => (
              <tr
                key={index}
                className={selectedFiles.includes(file.name) ? 'selected' : ''}
                onClick={() => onSelect(file.name)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.name)}
                    onChange={() => onSelect(file.name)}
                  />
                </td>
                <td>
                  <div className="file-name">
                    <div className={`file-icon ${file.type}`}>
                      {file.type === 'directory' ? (
                        <svg fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      ) : (
                        <svg fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="file-name-text">{file.name}</span>
                  </div>
                </td>
                <td>{file.type === 'directory' ? '-' : formatFileSize(file.size)}</td>
                <td>{file.modified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <>
      {/* Local Files */}
      <FileList
        files={localFiles}
        selectedFiles={selectedLocalFiles}
        onSelect={(fileName) => handleFileSelect(fileName, true)}
        title="Local Files"
        path={localPath}
        onPathChange={setLocalPath}
      />

      {/* Transfer Controls */}
      <div className="transfer-controls">
        <button onClick={handleUploadClick} className="transfer-btn upload" title="Upload files">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </button>
        <button className="transfer-btn download" title="Download files">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V8"
            />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Remote Files */}
      <FileList
        files={remoteFiles}
        selectedFiles={selectedRemoteFiles}
        onSelect={(fileName) => handleFileSelect(fileName, false)}
        title={`Remote Files (${credentials.host})`}
        path={remotePath}
        onPathChange={setRemotePath}
      />
    </>
  )
}

export default FileExplorer
