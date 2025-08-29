import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Notifications from './components/Notification'
import { ConfirmProvider } from './components/ConfirmProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      <Notifications />
    </ConfirmProvider>
  </StrictMode>
)
