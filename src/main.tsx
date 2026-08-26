import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handleGoogleRedirect } from './lib/googleAuth'

// Handles the Google OAuth redirect fallback (popup → opener session sync).
handleGoogleRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
