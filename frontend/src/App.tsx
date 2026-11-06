import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'react-hot-toast'
import { DarkModeProvider } from './contexts/DarkModeContext'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'
import BudgetDashboard from './pages/BudgetDashboard'
import BudgetEditor from './pages/BudgetEditor'
import { initializeExchangeRates } from './utils/currency'

// Initialize i18n - must be imported before any component that uses translations
import './i18n'

function App() {
  const { t } = useTranslation()
  const [isBackendReady, setIsBackendReady] = useState(false)
  
  // Initialize exchange rates when backend becomes ready
  useEffect(() => {
    if (isBackendReady) {
      initializeExchangeRates().catch((error) => {
        console.error('Failed to initialize exchange rates on app startup:', error)
      })
    }
  }, [isBackendReady])

  const handleBackendReady = () => {
    setIsBackendReady(true)
  }

  // Show loading screen until backend is ready
  if (!isBackendReady) {
    return (
      <DarkModeProvider>
        <LoadingScreen onReady={handleBackendReady} />
      </DarkModeProvider>
    )
  }

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
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="/budget/:id" element={<BudgetEditor />} />
            <Route path="*" element={
              <div className="mx-auto max-w-lg px-4 py-12 text-center text-gray-900 dark:text-white">
                <h1 className="text-2xl font-bold mb-3">{t('shellUX.pageNotFound')}</h1>
                <p className="mb-6">{t('shellUX.pageNotFoundHint')}</p>
                <Link to="/" className="inline-block rounded-lg bg-blue-600 px-5 py-3 text-white">{t('header.overview')}</Link>
              </div>
            } />
          </Routes>
        </Layout>
      </DarkModeProvider>
    </Router>
  )
}

export default App
