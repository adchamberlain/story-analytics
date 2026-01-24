import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ChartView from './pages/ChartView'
import DashboardView from './pages/DashboardView'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/chart/:chartId" element={<ChartView />} />
      <Route path="/dashboard/:slug" element={<DashboardView />} />
    </Routes>
  )
}

export default App
