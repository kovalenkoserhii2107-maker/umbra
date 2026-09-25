import { Route, Routes } from 'react-router-dom'
import { Layout } from './components'
import { FeedPage } from './pages/Feed'
import { HomePage } from './pages/Home'
import { LibraryPage } from './pages/Library'
import { LoginPage } from './pages/Login'
import { PersonPage } from './pages/Person'
import { PlatformPage, PlatformsPage } from './pages/Platforms'
import { SearchPage } from './pages/Search'
import { CabinetPage } from './pages/Cabinet'
import { SettingsPage } from './pages/Settings'
import { TitlePage } from './pages/Title'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/feed/:id" element={<FeedPage />} />
        <Route path="/platforms" element={<PlatformsPage />} />
        <Route path="/platforms/:slug" element={<PlatformPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cabinet" element={<CabinetPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/title/:type/:id" element={<TitlePage />} />
        <Route path="/person/:id" element={<PersonPage />} />
      </Routes>
    </Layout>
  )
}
