import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetApi, templateApi } from '../services/api'
import BudgetTable from '../components/BudgetTable'
import BudgetSummary from '../components/BudgetSummary'
import BalanceDifferenceCard from '../components/BalanceDifferenceCard'
import BudgetGraphs from '../components/BudgetGraphs'
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
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedCurrency, setDisplayCurrency] = useState<Currency>(getSelectedCurrency())
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [activeTab, setActiveTab] = useState<'table' | 'graphs'>('table')

  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['budget', budgetId, 'summary'],
    queryFn: async () => {
      const response = await budgetApi.getSummary(budgetId)
      return response.data
    },
    enabled: budgetId > 0,
  })

  const createTemplateMutation = useMutation({
    mutationFn: ({ name, overwrite }: { name: string; overwrite?: boolean }) =>
      templateApi.createFromBudget(budgetId, name, overwrite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowTemplateDialog(false)
      setShowOverwriteDialog(false)
      setTemplateName('')
      toast.success('Vorlage erfolgreich gespeichert')
    },
    onError: (error: any) => {
      // Check if it's a duplicate name error
      if (error.response?.status === 409 && error.response?.data?.error === 'DUPLICATE_NAME') {
        setShowOverwriteDialog(true)
      } else {
        toast.error(error.response?.data?.message || error.response?.data?.error || 'Fehler beim Speichern der Vorlage')
      }
    },
  })

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error('Bitte geben Sie einen Namen für die Vorlage ein')
      return
    }
    createTemplateMutation.mutate({ name: templateName.trim() })
  }

  const handleOverwriteTemplate = () => {
    if (!templateName.trim()) {
      toast.error('Bitte geben Sie einen Namen für die Vorlage ein')
      return
    }
    createTemplateMutation.mutate({ name: templateName.trim(), overwrite: true })
  }

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
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-6"></div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Lade Budget...</p>
        </div>
      </div>
    )
  }

  if (error || !summaryData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white dark:bg-slate-800 rounded-xl p-12 shadow-md border border-slate-200 dark:border-slate-700">
          <div className="text-7xl mb-6 animate-pulse">⚠️</div>
          <h2 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-3">Budget nicht gefunden</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md">
            Das angeforderte Budget existiert nicht oder konnte nicht geladen werden.
          </p>
          <Link
            to="/"
            className="px-10 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all inline-flex items-center font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
          >
            ← Zurück zur Übersicht
          </Link>
        </div>
      </div>
    )
  }

  const { budget, categories, entries, tax_entries, salary_reductions, actual_balances = [] } = summaryData
  const rates = getExchangeRates()

  return (
    <div className="min-h-screen">
      <div className="w-full px-4 py-8 animate-fade-in">
        {/* Header */}
        <div className="mb-12 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
          {/* Back Link */}
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-all hover:gap-3 group"
            >
              <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
              <span>Zurück zur Übersicht</span>
            </Link>
          </div>

          {/* Budget Info - Centered */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
              {budget.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">📅</span>
                <span className="text-blue-700 dark:text-blue-300 font-semibold text-sm">{budget.year}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">Basis:</span>
                <span className="text-slate-700 dark:text-slate-300 font-semibold text-sm">{budget.currency}</span>
              </div>
            </div>
          </div>

          {/* Controls - Centered */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Save as Template Button */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                Vorlage
              </label>
              <button
                onClick={() => setShowTemplateDialog(true)}
                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm flex items-center gap-2"
                title="Aktuelle Kategorien als Vorlage speichern"
              >
                <span>💾</span>
                Als Vorlage speichern
              </button>
            </div>

            {/* Currency Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                Anzeigewährung
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
                  className="px-5 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white font-medium text-sm shadow-sm transition-all bg-white"
                >
                  <option value="CHF">🇨🇭 {CURRENCY_SYMBOLS.CHF} {CURRENCY_NAMES.CHF}</option>
                  <option value="EUR">🇪🇺 {CURRENCY_SYMBOLS.EUR} {CURRENCY_NAMES.EUR}</option>
                  <option value="USD">🇺🇸 {CURRENCY_SYMBOLS.USD} {CURRENCY_NAMES.USD}</option>
                </select>
                <button
                  onClick={handleRefreshRates}
                  disabled={isLoadingRates}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50 shadow-sm font-medium text-base"
                  title="Wechselkurse aktualisieren"
                >
                  {isLoadingRates ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 dark:border-slate-300 border-t-transparent"></div>
                  ) : (
                    '🔄'
                  )}
                </button>
              </div>
            </div>

            {/* Month Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                Monatsansicht
              </label>
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="px-5 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white font-medium text-sm shadow-sm transition-all bg-white"
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
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">💱</span>
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Aktueller Kurs: 1 CHF = {rates[selectedCurrency].toFixed(4)} {CURRENCY_SYMBOLS[selectedCurrency]}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                    Stand: {new Date(rates.lastUpdated).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Balance Difference Card */}
        <div className="mb-12">
          <BalanceDifferenceCard
            categories={categories}
            entries={entries}
            taxEntries={tax_entries || []}
            salaryReductions={salary_reductions || []}
            actualBalances={actual_balances}
            selectedMonth={selectedMonth}
            displayCurrency={selectedCurrency}
            budgetYear={budget.year}
          />
        </div>

        {/* Summary Cards */}
        <div className="mb-12">
          <BudgetSummary
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            salaryReductions={salary_reductions || []}
            taxEntries={tax_entries || []}
            selectedMonth={selectedMonth}
            displayCurrency={selectedCurrency}
          />
        </div>

        {/* Tab Navigation */}
        <div className="mb-12 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex gap-1 p-1.5 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 px-8 py-4 rounded-lg font-semibold text-base transition-all duration-200 relative group ${
                activeTab === 'table'
                  ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">📊</span>
                <span>Tabelle</span>
              </span>
              {activeTab === 'table' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white dark:bg-blue-300 rounded-t-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('graphs')}
              className={`flex-1 px-8 py-4 rounded-lg font-semibold text-base transition-all duration-200 relative group ${
                activeTab === 'graphs'
                  ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">📈</span>
                <span>Grafiken</span>
              </span>
              {activeTab === 'graphs' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white dark:bg-blue-300 rounded-t-full"></div>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'table' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
            <BudgetTable
              budgetId={budgetId}
              categories={categories}
              entries={entries}
              taxEntries={tax_entries || []}
              salaryReductions={salary_reductions || []}
              selectedMonth={selectedMonth}
              displayCurrency={selectedCurrency}
              budgetYear={budget.year}
              actualBalances={actual_balances}
            />
          </div>
        ) : (
          <BudgetGraphs
            categories={categories}
            entries={entries}
            taxEntries={tax_entries || []}
            salaryReductions={salary_reductions || []}
            actualBalances={actual_balances}
            displayCurrency={selectedCurrency}
            budgetYear={budget.year}
          />
        )}

        {/* Help Text */}
        <div className="mt-6 text-center">
          <div className="inline-flex flex-col gap-1.5 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
            <p className="text-sm text-blue-700 dark:text-blue-300">💡 Tipp: Klicken Sie auf eine Zelle, um Beträge zu bearbeiten</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">💱 Alle Beträge werden in der gewählten Währung angezeigt</p>
          </div>
        </div>
      </div>

      {/* Save as Template Dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              💾 Als Vorlage speichern
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Speichern Sie die aktuellen Kategorien und deren Konfiguration (ohne Werte) als Vorlage für zukünftige Budgets.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Vorlagenname:
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="z.B. Standard Budget 2026"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveAsTemplate()
                    } else if (e.key === 'Escape') {
                      setShowTemplateDialog(false)
                      setTemplateName('')
                    }
                  }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={createTemplateMutation.isPending || !templateName.trim()}
                  className="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {createTemplateMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Speichern...
                    </span>
                  ) : (
                    '✓ Speichern'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowTemplateDialog(false)
                    setTemplateName('')
                  }}
                  disabled={createTemplateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm"
                >
                  ✕ Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Template Confirmation Dialog */}
      {showOverwriteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              ⚠️ Vorlage überschreiben?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Eine Vorlage mit dem Namen <strong className="text-slate-900 dark:text-white">"{templateName}"</strong> existiert bereits.
              Möchten Sie die vorhandene Vorlage überschreiben?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleOverwriteTemplate}
                disabled={createTemplateMutation.isPending}
                className="flex-1 px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {createTemplateMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Überschreiben...
                  </span>
                ) : (
                  '✓ Überschreiben'
                )}
              </button>
              <button
                onClick={() => {
                  setShowOverwriteDialog(false)
                  setTemplateName('')
                }}
                disabled={createTemplateMutation.isPending}
                className="flex-1 px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm"
              >
                ✕ Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BudgetEditor
