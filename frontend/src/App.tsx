import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { DarkModeProvider } from './contexts/DarkModeContext'
import Layout from './components/Layout'
import BudgetDashboard from './pages/BudgetDashboard'
import BudgetEditor from './pages/BudgetEditor'
import MonthlyView from './pages/MonthlyView'
import { initializeExchangeRates } from './utils/currency'

function App() {
  // Initialize exchange rates on app startup
  useEffect(() => {
    initializeExchangeRates().catch((error) => {
      console.error('Failed to initialize exchange rates on app startup:', error)
    })
  }, [])

  return (
    <Router>
      <DarkModeProvider>
        <Layout>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'rgba(30, 41, 59, 0.95)',
                color: '#fff',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
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
        </Layout>
      </DarkModeProvider>
    </Router>
  )
}

export default App
