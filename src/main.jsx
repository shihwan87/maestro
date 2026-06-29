import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// iOS Safari ignores `user-scalable=no` in browser tabs, so block pinch-zoom
// gestures explicitly. Standalone PWA mode honors the viewport meta directly.
const blockGesture = (e) => e.preventDefault()
document.addEventListener('gesturestart', blockGesture)
document.addEventListener('gesturechange', blockGesture)
document.addEventListener('gestureend', blockGesture)

// Block double-tap zoom fallback (touch-action: manipulation handles most cases).
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = Date.now()
  if (now - lastTouchEnd <= 300) e.preventDefault()
  lastTouchEnd = now
}, { passive: false })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
