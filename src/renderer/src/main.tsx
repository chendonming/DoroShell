import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Notifications from './components/Notification'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Notifications />
  </StrictMode>
)
