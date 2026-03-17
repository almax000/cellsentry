import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './i18n'
import App from './App'
import DownloadApp from './DownloadApp'
import './styles/variables.css'

const isDownloadMode = new URLSearchParams(window.location.search).get('download') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDownloadMode ? (
      <DownloadApp />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </React.StrictMode>
)
