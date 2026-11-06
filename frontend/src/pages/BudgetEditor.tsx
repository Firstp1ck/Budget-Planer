import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { budgetApi, templateApi } from '../services/api'
import BudgetTable from '../components/BudgetTable'
import BudgetSummary from '../components/BudgetSummary'
import BalanceDifferenceCard from '../components/BalanceDifferenceCard'
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


const BudgetGraphs = lazy(() => import('../components/BudgetGraphs'))

export function getPlanningYears(entries: { year: number }[], balances: { year: number }[], currentYear: number, selectedYear: number | null): number[] {
  const years = new Set([currentYear, ...entries.map(entry => entry.year), ...balances.map(balance => balance.year)])
  const anchor = selectedYear ?? currentYear
  years.add(anchor - 1)
  years.add(anchor)
  years.add(anchor + 1)
  return [...years].filter(year => year >= 2000 && year <= 2100).sort((a, b) => b - a)
}

function BudgetEditorContent({ budgetId }: { budgetId: number }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedCurrency, setDisplayCurrency] = useState<Currency>(getSelectedCurrency())
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const templateDialogRef = useRef<HTMLDialogElement>(null)
  const overwriteDialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<'table' | 'graphs'>('table')

  // Get locale for date formatting based on current language
  const dateLocale = i18n.language === 'de-DE' ? 'de-DE' : 'en-US'

  const { data: summaryData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['budget', budgetId, 'summary'],
    queryFn: async () => {
      const response = await budgetApi.getSummary(budgetId)
      return response.data
    },
    enabled: Number.isInteger(budgetId) && budgetId > 0,
  })

  // Fetch templates for autocomplete suggestions
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await templateApi.getAll()
      return response.data.results || []
    },
    enabled: showTemplateDialog, // Only fetch when dialog is open
  })

  const createTemplateMutation = useMutation({
    mutationFn: ({ name, overwrite }: { name: string; overwrite?: boolean }) =>
      templateApi.createFromBudget(budgetId, name, overwrite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowTemplateDialog(false)
      setShowOverwriteDialog(false)
      setTemplateName('')
      toast.success(t('template.saved'))
    },
    onError: (error: any) => {
      // Check if it's a duplicate name error
      if (error.response?.status === 409 && error.response?.data?.error === 'DUPLICATE_NAME') {
        setShowOverwriteDialog(true)
      } else {
        toast.error(error.response?.data?.message || error.response?.data?.error || t('template.errorSaving'))
      }
    },
  })

  const handleSaveAsTemplate = () => {
    if (createTemplateMutation.isPending || showOverwriteDialog) return
    if (!templateName.trim()) {
      toast.error(t('template.enterName'))
      return
    }
    createTemplateMutation.mutate({ name: templateName.trim() })
  }

  const handleOverwriteTemplate = () => {
    if (createTemplateMutation.isPending) return
    if (!templateName.trim()) {
      toast.error(t('template.enterName'))
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
          toast.success(t('currency.ratesUpdated'))
        }
      } catch (error) {
        console.error('Error initializing exchange rates:', error)
        toast.error(t('currency.errorLoadingRates'))
      } finally {
        setIsLoadingRates(false)
      }
    }

    updateRates()
  }, [t])

  const handleCurrencyChange = (currency: Currency) => {
    setDisplayCurrency(currency)
    setSelectedCurrency(currency)
    toast.success(t('currency.currencyChanged', { currency: CURRENCY_NAMES[currency] }))
  }

  const handleRefreshRates = async () => {
    setIsLoadingRates(true)
    try {
      await fetchExchangeRates()
      toast.success(t('currency.ratesRefreshed'))
    } catch (error) {
      toast.error(t('currency.errorRefreshingRates'))
    } finally {
      setIsLoadingRates(false)
    }
  }

  // Extract data safely - use empty defaults if not loaded yet
  const { budget, categories, entries = [], tax_entries, salary_reductions, actual_balances = [] } = summaryData || {}
  const rates = getExchangeRates()

  const availableYears = useMemo(() => getPlanningYears(entries, actual_balances, new Date().getFullYear(), selectedYear), [entries, actual_balances, selectedYear])

  useEffect(() => {
    if (selectedYear !== null || !summaryData) return
    const recordedYears = [...entries, ...actual_balances].map(item => item.year)
    setSelectedYear(recordedYears.length ? Math.max(...recordedYears) : new Date().getFullYear())
  }, [summaryData, entries, actual_balances, selectedYear])

  useEffect(() => {
    const templateDialog = templateDialogRef.current
    const overwriteDialog = overwriteDialogRef.current
    // Close the nested confirmation first so native focus restoration returns to the trigger.
    if (!showOverwriteDialog && overwriteDialog?.open) overwriteDialog.close()
    if (!showTemplateDialog && templateDialog?.open) templateDialog.close()
    if (showTemplateDialog && templateDialog && !templateDialog.open) templateDialog.showModal()
    if (showOverwriteDialog && overwriteDialog && !overwriteDialog.open) overwriteDialog.showModal()
  }, [showTemplateDialog, showOverwriteDialog])

  // Filter entries and balances by selected year - must be called before early returns
  const filteredEntries = useMemo(() => {
    if (!entries || entries.length === 0) return []
    if (selectedYear === null) return entries
    return entries.filter(entry => entry.year === selectedYear)
  }, [entries, selectedYear])

  const filteredActualBalances = useMemo(() => {
    if (!actual_balances || actual_balances.length === 0) return []
    if (selectedYear === null) return actual_balances
    return actual_balances.filter(balance => balance.year === selectedYear)
  }, [actual_balances, selectedYear])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-6"></div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('budget.loadingBudget')}</p>
        </div>
      </div>
    )
  }

  const missingBudget = !Number.isInteger(budgetId) || budgetId <= 0 || (error as { response?: { status?: number } } | null)?.response?.status === 404
  if (!summaryData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white dark:bg-slate-800 rounded-xl p-12 shadow-md border border-slate-200 dark:border-slate-700">
          <div className="text-7xl mb-6 animate-pulse">⚠️</div>
          <h2 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-3">{t(missingBudget ? 'budget.notFound' : 'editorUX.loadError')}</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md">
            {t(missingBudget ? 'budget.notFoundDescription' : 'editorUX.loadErrorDetail')}
          </p>
          {!missingBudget && <button onClick={() => void refetch()} disabled={isFetching} className="mb-4 block mx-auto px-5 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50">{t('editorUX.retry')}</button>}
          <Link
            to="/"
            className="px-10 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all inline-flex items-center font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
          >
            ← {t('budget.backToOverview')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 animate-fade-in">
        {error && <div role="alert" className="mb-4 p-4 rounded-lg bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{t('editorUX.refreshError')} <button onClick={() => void refetch()} disabled={isFetching} className="underline font-semibold">{t('editorUX.retry')}</button></div>}
        {/* Header */}
        <div className="mb-12 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
          {/* Back Link */}
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-all hover:gap-3 group"
            >
              <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
              <span>{t('budget.backToOverview')}</span>
            </Link>
          </div>

          {/* Budget Info - Centered */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
              {budget?.name || t('budget.budget')}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">{t('budget.base')}:</span>
                <span className="text-slate-700 dark:text-slate-300 font-semibold text-sm">CHF</span>
              </div>
            </div>
          </div>

          {/* Controls - Centered */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Save as Template Button */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                {t('template.template')}
              </label>
              <button
                onClick={() => { createTemplateMutation.reset(); setShowTemplateDialog(true) }}
                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm flex items-center gap-2"
                title={t('template.saveAsTemplate')}
              >
                <span>💾</span>
                {t('template.saveAsTemplate')}
              </button>
            </div>

            {/* Currency Selector */}
            <div className="flex flex-col gap-2">
              <label htmlFor="editor-currency" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                {t('currency.displayCurrency')}
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="editor-currency"
                  value={selectedCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
                  className="px-5 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white font-medium text-sm shadow-sm transition-all bg-white cursor-pointer"
                >
                  <option value="CHF">🇨🇭 {CURRENCY_SYMBOLS.CHF} {CURRENCY_NAMES.CHF}</option>
                  <option value="EUR">🇪🇺 {CURRENCY_SYMBOLS.EUR} {CURRENCY_NAMES.EUR}</option>
                  <option value="USD">🇺🇸 {CURRENCY_SYMBOLS.USD} {CURRENCY_NAMES.USD}</option>
                </select>
                <button
                  onClick={handleRefreshRates}
                  disabled={isLoadingRates}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50 shadow-sm font-medium text-base"
                  title={t('currency.refreshRates')}
                >
                  {isLoadingRates ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 dark:border-slate-300 border-t-transparent"></div>
                  ) : (
                    '🔄'
                  )}
                </button>
              </div>
            </div>

            {/* Year Selector */}
            <div className="flex flex-col gap-2">
              <label htmlFor="editor-year" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">
                {t('editor.year')}
              </label>
              <select
                id="editor-year"
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : null)}
                className="px-5 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white font-medium text-sm shadow-sm transition-all bg-white cursor-pointer"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Exchange Rate Info */}
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">💱</span>
              <div className="flex-1">
                {selectedCurrency !== 'CHF' ? (
                  <>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      {t('currency.currentRate')}: 1 CHF = {rates[selectedCurrency].toFixed(4)} {CURRENCY_SYMBOLS[selectedCurrency]}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                      {t('currency.asOf')}: {new Date(rates.lastUpdated).toLocaleDateString(dateLocale, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                      {t('currency.currentRates')}:
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-blue-700 dark:text-blue-300">
                      <span>1 CHF = {rates.EUR.toFixed(4)} {CURRENCY_SYMBOLS.EUR}</span>
                      <span>1 CHF = {rates.USD.toFixed(4)} {CURRENCY_SYMBOLS.USD}</span>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1.5">
                      {t('currency.asOf')}: {new Date(rates.lastUpdated).toLocaleDateString(dateLocale, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mb-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-900 dark:text-blue-100">{t('editorUX.inputCurrency')}</p>

        {/* Balance Difference Card */}
        <div className="mb-12">
          <BalanceDifferenceCard
            key={selectedYear}
            categories={categories || []}
            entries={filteredEntries}
            taxEntries={tax_entries || []}
            salaryReductions={salary_reductions || []}
            actualBalances={filteredActualBalances}
            selectedMonth={null}
            displayCurrency={selectedCurrency}
            budgetYear={selectedYear || new Date().getFullYear()}
          />
        </div>

        {/* Summary Cards */}
        <div className="mb-12">
          <BudgetSummary
            key={selectedYear}
            budgetId={budgetId}
            categories={categories || []}
            entries={filteredEntries}
            salaryReductions={salary_reductions || []}
            taxEntries={tax_entries || []}
            selectedMonth={null}
            displayCurrency={selectedCurrency}
          />
        </div>

        {/* Tab Navigation */}
        <div className="mb-12 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex gap-1 p-1.5 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={() => setActiveTab('table')}
              aria-pressed={activeTab === 'table'}
              className={`flex-1 px-8 py-4 rounded-lg font-semibold text-base transition-all duration-200 relative group ${
                activeTab === 'table'
                  ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">📊</span>
                <span>{t('editor.table')}</span>
              </span>
              {activeTab === 'table' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white dark:bg-blue-300 rounded-t-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('graphs')}
              aria-pressed={activeTab === 'graphs'}
              className={`flex-1 px-8 py-4 rounded-lg font-semibold text-base transition-all duration-200 relative group ${
                activeTab === 'graphs'
                  ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">📈</span>
                <span>{t('editor.graphs')}</span>
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
              key={selectedYear}
              budgetId={budgetId}
              categories={categories || []}
              entries={filteredEntries}
              taxEntries={tax_entries || []}
              salaryReductions={salary_reductions || []}
              selectedMonth={null}
              displayCurrency={selectedCurrency}
              budgetYear={selectedYear || new Date().getFullYear()}
              actualBalances={filteredActualBalances}
            />
          </div>
        ) : (
          <Suspense fallback={<p role="status" className="p-6 text-center">{t('editorUX.loadingGraphs')}</p>}>
            <BudgetGraphs
            categories={categories || []}
            entries={filteredEntries}
            taxEntries={tax_entries || []}
            salaryReductions={salary_reductions || []}
            actualBalances={filteredActualBalances}
            displayCurrency={selectedCurrency}
            budgetYear={selectedYear || new Date().getFullYear()}
          />
          </Suspense>
        )}

        {/* Help Text */}
        <div className="mt-6 text-center">
          <div className="inline-flex flex-col gap-1.5 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
            <p className="text-sm text-blue-700 dark:text-blue-300">💡 {t('editor.tipClickCell')}</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">💱 {t('editor.tipCurrencyDisplay')}</p>
          </div>
        </div>
      </div>

      {/* Save as Template Dialog */}
      <dialog ref={templateDialogRef} aria-labelledby="template-dialog-title" aria-describedby="template-dialog-description" onCancel={(event) => { if (createTemplateMutation.isPending) event.preventDefault(); else { setShowTemplateDialog(false); setTemplateName('') } }} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white backdrop:bg-black/50">
          <div className="p-6">
            <h2 id="template-dialog-title" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t('template.saveAsTemplateTitle')}
            </h2>
            <p id="template-dialog-description" className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {t('template.saveAsTemplateDescription')}
            </p>
            {createTemplateMutation.isError && !showOverwriteDialog && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{t('template.errorSaving')}</p>}
            <div className="space-y-4">
              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('template.templateName')}:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="template-name"
                    maxLength={200}
                    disabled={createTemplateMutation.isPending}
                    list="template-suggestions"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={t('template.templateNamePlaceholder')}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveAsTemplate()
                      }
                    }}
                  />
                  <datalist id="template-suggestions">
                    {templatesData?.map((template) => (
                      <option key={template.id} value={template.name} />
                    ))}
                  </datalist>
                </div>
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
                      {t('category.saving')}
                    </span>
                  ) : (
                    `✓ ${t('common.save')}`
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
                  ✕ {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
      </dialog>

      {/* Overwrite Template Confirmation Dialog */}
      <dialog ref={overwriteDialogRef} aria-labelledby="overwrite-dialog-title" aria-describedby="overwrite-dialog-description" onCancel={(event) => { if (createTemplateMutation.isPending) event.preventDefault(); else setShowOverwriteDialog(false) }} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white backdrop:bg-black/50">
          <div className="p-6">
            <h2 id="overwrite-dialog-title" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t('template.overwriteTitle')}
            </h2>
            <p id="overwrite-dialog-description" className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {t('template.overwriteDescription', { name: templateName })}
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
                    {t('template.overwriting')}
                  </span>
                ) : (
                  `✓ ${t('template.overwrite')}`
                )}
              </button>
              <button
                autoFocus
                onClick={() => {
                  setShowOverwriteDialog(false)
                }}
                disabled={createTemplateMutation.isPending}
                className="flex-1 px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm"
              >
                ✕ {t('common.cancel')}
              </button>
            </div>
          </div>
      </dialog>
    </div>
  )
}

function BudgetEditor() {
  const { id } = useParams<{ id: string }>()
  const budgetId = Number(id)
  return <BudgetEditorContent key={id} budgetId={budgetId} />
}

export default BudgetEditor
