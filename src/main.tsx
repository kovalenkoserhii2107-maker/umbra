import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AppStateProvider } from './state.tsx'
import { listenAuth } from './lib/auth'

listenAuth()

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
})

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { err: error.message }
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: '#fcfcfc', padding: 24, fontFamily: 'Manrope, sans-serif' }}>
          <p style={{ color: '#ff9e64', letterSpacing: '0.2em', fontSize: 11 }}>UMBRA</p>
          <p style={{ marginTop: 12 }}>Не удалось открыть экран.</p>
          <p style={{ marginTop: 8, color: '#9e9e9e', fontSize: 13 }}>{this.state.err}</p>
          <button
            style={{ marginTop: 20, border: '1px solid #212121', background: 'transparent', color: '#fcfcfc', padding: '8px 14px', borderRadius: 999 }}
            onClick={() => window.location.assign('/umbra/#/')}
          >
            На главную
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <HashRouter>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </HashRouter>
    </Boundary>
  </StrictMode>,
)
