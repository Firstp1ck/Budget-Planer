import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import BudgetDashboard from './pages/BudgetDashboard'
import BudgetEditor from './pages/BudgetEditor'
import MonthlyView from './pages/MonthlyView'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Routes>
          <Route path="/" element={<BudgetDashboard />} />
          <Route path="/budget/:id" element={<BudgetEditor />} />
          <Route path="/budget/:id/month/:month" element={<MonthlyView />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
