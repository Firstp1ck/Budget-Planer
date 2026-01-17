import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import BudgetDashboard from './pages/BudgetDashboard'
import BudgetEditor from './pages/BudgetEditor'
import MonthlyView from './pages/MonthlyView'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
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
