import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import './styles/tailwind.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
// Initialize theme before React renders to prevent FOUC
import './stores/themeStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
