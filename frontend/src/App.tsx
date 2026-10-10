import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ForecastPage from './pages/ForecastPage'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import OfficerPage from './pages/OfficerPage'
import ReportPage from './pages/ReportPage'
import { AlertsProvider } from './hooks/AlertsProvider'

export default function App() {
  return (
    <AlertsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/officer" element={<OfficerPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AlertsProvider>
  )
}
