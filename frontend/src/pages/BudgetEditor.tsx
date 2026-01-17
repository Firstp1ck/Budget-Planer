import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { budgetApi } from '../services/api'
import BudgetTable from '../components/BudgetTable'
import BudgetSummary from '../components/BudgetSummary'

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

function BudgetEditor() {
  const { id } = useParams<{ id: string }>()
  const budgetId = parseInt(id || '0')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['budget', budgetId, 'summary'],
    queryFn: async () => {
      const response = await budgetApi.getSummary(budgetId)
      return response.data
    },
    enabled: budgetId > 0,
  })

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
                  {budget.currency}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
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
        </div>

        {/* Summary Cards */}
        <div className="mb-6">
          <BudgetSummary
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            selectedMonth={selectedMonth}
          />
        </div>

        {/* Budget Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <BudgetTable
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            selectedMonth={selectedMonth}
          />
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>💡 Tipp: Klicken Sie auf eine Zelle, um Beträge zu bearbeiten</p>
        </div>
      </div>
    </div>
  )
}

export default BudgetEditor
