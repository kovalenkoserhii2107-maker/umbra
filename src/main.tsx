import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AppStateProvider } from './state.tsx'
import { APP_VERSION } from './version.ts'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    registration?.update()
    window.setInterval(() => registration?.update(), 30_000)
  },
})

fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
  .then((res) => res.json())
  .then((data: { v?: string }) => {
    if (data.v && data.v !== APP_VERSION) window.location.reload()
  })
  .catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </HashRouter>
  </StrictMode>,
)
