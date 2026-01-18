import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetApi } from '../services/api'
import BudgetTable from '../components/BudgetTable'
import BudgetSummary from '../components/BudgetSummary'
import {
  Currency,
  CURRENCY_SYMBOLS,
  CURRENCY_NAMES,
  getSelectedCurrency,
  setSelectedCurrency,
  initializeExchangeRates,
  fetchExchangeRates,
  getExchangeRates,
} from '../utils/currency'

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

function BudgetEditor() {
  const { id } = useParams<{ id: string }>()
  const budgetId = parseInt(id || '0')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedCurrency, setDisplayCurrency] = useState<Currency>(getSelectedCurrency())
  const [isLoadingRates, setIsLoadingRates] = useState(false)

  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['budget', budgetId, 'summary'],
    queryFn: async () => {
      const response = await budgetApi.getSummary(budgetId)
      return response.data
    },
    enabled: budgetId > 0,
  })

  // Initialize exchange rates on mount
  useEffect(() => {
    const updateRates = async () => {
      setIsLoadingRates(true)
      try {
        const rates = await initializeExchangeRates()
        // Only show success toast if rates were actually fetched (not from cache)
        const lastUpdated = new Date(rates.lastUpdated)
        const now = new Date()
        const minutesDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60)

        if (minutesDiff < 5) {
          toast.success('Wechselkurse aktualisiert')
        }
      } catch (error) {
        console.error('Error initializing exchange rates:', error)
        toast.error('Fehler beim Laden der Wechselkurse')
      } finally {
        setIsLoadingRates(false)
      }
    }

    updateRates()
  }, [])

  const handleCurrencyChange = (currency: Currency) => {
    setDisplayCurrency(currency)
    setSelectedCurrency(currency)
    toast.success(`Währung geändert zu ${CURRENCY_NAMES[currency]}`)
  }

  const handleRefreshRates = async () => {
    setIsLoadingRates(true)
    try {
      await fetchExchangeRates()
      toast.success('Wechselkurse erfolgreich aktualisiert')
    } catch (error) {
      toast.error('Fehler beim Aktualisieren der Wechselkurse')
    } finally {
      setIsLoadingRates(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Budget...</p>
        </div>
      </div>
    )
  }

  if (error || !summaryData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Budget nicht gefunden</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Das angeforderte Budget existiert nicht oder konnte nicht geladen werden.
          </p>
          <Link
            to="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all inline-block font-semibold"
          >
            ← Zurück zur Übersicht
          </Link>
        </div>
      </div>
    )
  }

  const { budget, categories, entries } = summaryData
  const rates = getExchangeRates()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-6 max-w-[1600px]">
        {/* Header */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <Link
                to="/"
                className="text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-flex items-center gap-2 text-sm font-medium"
              >
                ← Zurück zur Übersicht
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {budget.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-semibold">
                  {budget.year}
                </span>
                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-semibold">
                  Basis: {budget.currency}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Currency Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Anzeige:
                </label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white font-medium"
                >
                  <option value="CHF">🇨🇭 {CURRENCY_SYMBOLS.CHF} {CURRENCY_NAMES.CHF}</option>
                  <option value="EUR">🇪🇺 {CURRENCY_SYMBOLS.EUR} {CURRENCY_NAMES.EUR}</option>
                  <option value="USD">🇺🇸 {CURRENCY_SYMBOLS.USD} {CURRENCY_NAMES.USD}</option>
                </select>
                <button
                  onClick={handleRefreshRates}
                  disabled={isLoadingRates}
                  className="px-3 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                  title="Wechselkurse aktualisieren"
                >
                  {isLoadingRates ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700 dark:border-gray-300"></div>
                  ) : (
                    '🔄'
                  )}
                </button>
              </div>

              {/* Month Selector */}
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white font-medium"
              >
                <option value="">🗓️ Alle Monate</option>
                {MONTHS.map((month, index) => (
                  <option key={index} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Exchange Rate Info */}
          {selectedCurrency !== 'CHF' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💱 Aktueller Kurs: 1 CHF = {rates[selectedCurrency].toFixed(4)} {CURRENCY_SYMBOLS[selectedCurrency]}
                <span className="text-xs ml-2 opacity-75">
                  (Stand: {new Date(rates.lastUpdated).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })})
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="mb-6">
          <BudgetSummary
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            selectedMonth={selectedMonth}
            displayCurrency={selectedCurrency}
          />
        </div>

        {/* Budget Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <BudgetTable
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            selectedMonth={selectedMonth}
            displayCurrency={selectedCurrency}
            budgetYear={budget.year}
          />
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>💡 Tipp: Klicken Sie auf eine Zelle, um Beträge zu bearbeiten</p>
          <p className="mt-1">💱 Alle Beträge werden in der gewählten Währung angezeigt</p>
        </div>
      </div>
    </div>
  )
}

export default BudgetEditor
