import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { budgetApi } from '../services/api'
import { useDarkMode } from '../contexts/DarkModeContext'

interface LoadingScreenProps {
  onReady: () => void
  maxRetries?: number
  retryDelayMs?: number
  maxWaitTimeMs?: number
}

type LoadingStatus = 
  | 'initializing'
  | 'checking_backend'
  | 'waiting_for_migrations'
  | 'connecting'
  | 'ready'
  | 'error'

interface StatusMessage {
  status: LoadingStatus
  message: string
  detail?: string
}

/**
 * LoadingScreen component that displays during app initialization.
 * Shows visual progress while waiting for the backend to become ready.
 * Handles automatic retries with increasing delays.
 */
function LoadingScreen({ 
  onReady, 
  maxRetries = 60, // 60 retries = ~60-90 seconds with increasing delays
  retryDelayMs = 1000,
  maxWaitTimeMs = 90000 // 90 seconds max wait time
}: LoadingScreenProps) {
  const { t } = useTranslation()
  const { isDark } = useDarkMode()
  
  const [status, setStatus] = useState<LoadingStatus>('initializing')
  const [attempt, setAttempt] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [startTime] = useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const getStatusInfo = useCallback((): StatusMessage => {
    switch (status) {
      case 'initializing':
        return {
          status,
          message: t('loading.initializing', 'Anwendung wird initialisiert...'),
          detail: t('loading.initializing_detail', 'Backend-Dienste werden vorbereitet')
        }
      case 'checking_backend':
        return {
          status,
          message: t('loading.checking_backend', 'Verbindung wird hergestellt...'),
          detail: t('loading.checking_backend_detail', `Versuch ${attempt + 1}`)
        }
      case 'waiting_for_migrations':
        return {
          status,
          message: t('loading.waiting_migrations', 'Datenbank wird eingerichtet...'),
          detail: t('loading.waiting_migrations_detail', 'Erste Einrichtung kann einige Sekunden dauern')
        }
      case 'connecting':
        return {
          status,
          message: t('loading.connecting', 'Fast geschafft...'),
          detail: t('loading.connecting_detail', 'Backend wird verbunden')
        }
      case 'ready':
        return {
          status,
          message: t('loading.ready', 'Bereit!'),
          detail: t('loading.ready_detail', 'Anwendung wird geladen')
        }
      case 'error':
        return {
          status,
          message: t('loading.error', 'Verbindungsfehler'),
          detail: errorMessage || t('loading.error_detail', 'Backend-Server nicht erreichbar')
        }
    }
  }, [status, attempt, errorMessage, t])

  const checkBackendHealth = useCallback(async (): Promise<boolean> => {
    try {
      await budgetApi.health()
      return true
    } catch {
      return false
    }
  }, [])

  const runHealthCheck = useCallback(async () => {
    let currentAttempt = 0
    let isReady = false
    
    // Initial delay to let backend start
    setStatus('initializing')
    await new Promise(resolve => setTimeout(resolve, 500))
    
    while (currentAttempt < maxRetries && !isReady) {
      setAttempt(currentAttempt)
      
      // Update status based on attempt number
      if (currentAttempt < 3) {
        setStatus('checking_backend')
      } else if (currentAttempt < 15) {
        setStatus('waiting_for_migrations')
      } else {
        setStatus('connecting')
      }
      
      // Check if we've exceeded max wait time
      if (Date.now() - startTime > maxWaitTimeMs) {
        setStatus('error')
        setErrorMessage(t('loading.timeout', 'Zeitüberschreitung beim Warten auf Backend'))
        return
      }
      
      isReady = await checkBackendHealth()
      
      if (isReady) {
        setStatus('ready')
        // Small delay to show "Ready" state before transitioning
        await new Promise(resolve => setTimeout(resolve, 300))
        onReady()
        return
      }
      
      currentAttempt++
      
      // Progressive delay: start at 1s, increase to max 2s
      const delay = Math.min(retryDelayMs + (currentAttempt * 50), 2000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    
    // Max retries exceeded
    setStatus('error')
    setErrorMessage(t('loading.max_retries', 'Backend-Server konnte nicht gestartet werden'))
  }, [maxRetries, retryDelayMs, maxWaitTimeMs, startTime, checkBackendHealth, onReady, t])

  useEffect(() => {
    runHealthCheck()
  }, []) // Run once on mount

  const handleRetry = () => {
    setStatus('initializing')
    setAttempt(0)
    setErrorMessage(null)
    runHealthCheck()
  }

  const statusInfo = getStatusInfo()
  
  // Calculate progress percentage (based on typical startup time of ~15-30 seconds)
  const progressPercent = status === 'ready' 
    ? 100 
    : status === 'error' 
      ? 0 
      : Math.min(95, (elapsedSeconds / 30) * 100)

  return (
    <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950' 
        : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'
    }`}>
      <div className={`max-w-md w-full mx-4 p-8 rounded-2xl shadow-2xl border backdrop-blur-sm transition-all duration-300 ${
        isDark
          ? 'bg-slate-900/80 border-slate-700/50'
          : 'bg-white/90 border-gray-200/50'
      }`}>
        {/* Logo/Icon */}
        <div className="text-center mb-8">
          <div className={`w-24 h-24 mx-auto mb-4 rounded-2xl flex items-center justify-center text-5xl shadow-lg ${
            status === 'error'
              ? 'bg-gradient-to-br from-red-500 to-orange-500'
              : status === 'ready'
                ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                : 'bg-gradient-to-br from-blue-500 to-cyan-500'
          } ${status !== 'error' && status !== 'ready' ? 'animate-pulse' : ''}`}>
            {status === 'error' ? '⚠️' : status === 'ready' ? '✓' : '💰'}
          </div>
          <h1 className={`text-2xl font-bold mb-2 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            Budget Planer
          </h1>
          <p className={`text-sm ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            {t('loading.subtitle', 'Ihre Finanzverwaltung')}
          </p>
        </div>

        {/* Status Message */}
        <div className="text-center mb-6">
          <p className={`text-lg font-semibold mb-1 ${
            status === 'error'
              ? 'text-red-500'
              : status === 'ready'
                ? 'text-green-500'
                : isDark ? 'text-white' : 'text-gray-800'
          }`}>
            {statusInfo.message}
          </p>
          {statusInfo.detail && (
            <p className={`text-sm ${
              isDark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              {statusInfo.detail}
            </p>
          )}
        </div>

        {/* Progress Bar */}
        {status !== 'error' && (
          <div className="mb-6">
            <div className={`h-2 rounded-full overflow-hidden ${
              isDark ? 'bg-slate-700' : 'bg-gray-200'
            }`}>
              <div 
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  status === 'ready'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className={`text-xs ${
                isDark ? 'text-slate-500' : 'text-gray-400'
              }`}>
                {elapsedSeconds}s
              </span>
              <span className={`text-xs ${
                isDark ? 'text-slate-500' : 'text-gray-400'
              }`}>
                {Math.round(progressPercent)}%
              </span>
            </div>
          </div>
        )}

        {/* Loading Animation */}
        {status !== 'error' && status !== 'ready' && (
          <div className="flex justify-center mb-6">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${
                    isDark ? 'bg-blue-400' : 'bg-blue-500'
                  }`}
                  style={{
                    animation: 'bounce 1s infinite',
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg text-sm ${
              isDark 
                ? 'bg-red-900/30 text-red-200 border border-red-800/50' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <p className="font-medium mb-2">
                {t('loading.error_help_title', 'Mögliche Ursachen:')}
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>{t('loading.error_help_1', 'Der Backend-Server wurde nicht gestartet')}</li>
                <li>{t('loading.error_help_2', 'Die erste Einrichtung benötigt mehr Zeit')}</li>
                <li>{t('loading.error_help_3', 'Eine Firewall blockiert Port 8000')}</li>
                <li>{t('loading.error_help_4', 'Python-Abhängigkeiten fehlen')}</li>
              </ul>
            </div>
            <button
              onClick={handleRetry}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              {t('loading.retry', 'Erneut versuchen')}
            </button>
          </div>
        )}

        {/* Info Text (during loading) */}
        {status !== 'error' && status !== 'ready' && (
          <div className={`text-center text-xs ${
            isDark ? 'text-slate-500' : 'text-gray-400'
          }`}>
            <p>
              {t('loading.first_start_info', 'Bei der ersten Verwendung kann die Einrichtung etwas länger dauern.')}
            </p>
          </div>
        )}
      </div>

      {/* CSS Animation Keyframes */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  )
}

export default LoadingScreen
