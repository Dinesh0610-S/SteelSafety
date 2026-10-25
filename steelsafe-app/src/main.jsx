import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Default to dark mode unless explicitly set to light
const saved = localStorage.getItem('ss-theme')
if (saved !== 'light') {
  document.documentElement.classList.add('dark')
}

// Register PWA Service Worker for offline shell caching
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('SteelSafe Service Worker registered:', reg.scope)
      })
      .catch(err => {
        console.warn('Service Worker registration skipped:', err)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
