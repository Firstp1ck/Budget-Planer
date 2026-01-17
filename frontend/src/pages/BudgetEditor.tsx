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

  const { data: summaryData, isLoading } = useQuery({
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
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Budget nicht gefunden</div>
      </div>
    )
  }

  const { budget, categories, entries } = summaryData

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link
              to="/"
              className="text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
            >
              ← Zurück zur Übersicht
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {budget.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{budget.year}</p>
          </div>

          <div className="flex gap-3">
            <select
              value={selectedMonth || ''}
              onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Alle Monate</option>
              {MONTHS.map((month, index) => (
                <option key={index} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>

        <BudgetSummary
          budgetId={budgetId}
          categories={categories}
          entries={entries}
          selectedMonth={selectedMonth}
        />

        <div className="mt-8">
          <BudgetTable
            budgetId={budgetId}
            categories={categories}
            entries={entries}
            selectedMonth={selectedMonth}
          />
        </div>
      </div>
    </div>
  )
}

export default BudgetEditor
