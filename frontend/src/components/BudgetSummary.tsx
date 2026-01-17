import type { BudgetCategory, BudgetEntry } from '../types/budget'

interface BudgetSummaryProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  selectedMonth: number | null
}

function BudgetSummary({ categories, entries, selectedMonth }: BudgetSummaryProps) {
  const calculateTotals = () => {
    let totalIncome = 0
    let totalExpenses = 0

    const filteredEntries = selectedMonth
      ? entries.filter((e) => e.month === selectedMonth)
      : entries

    filteredEntries.forEach((entry) => {
      const amount = parseFloat(entry.actual_amount || entry.planned_amount)
      const category = categories.find((c) => c.id === entry.category)

      if (category?.category_type === 'INCOME') {
        totalIncome += amount
      } else {
        totalExpenses += amount
      }
    })

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
    }
  }

  const { totalIncome, totalExpenses, balance } = calculateTotals()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Gesamteinnahmen {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
        </h3>
        <p className="text-3xl font-bold text-green-600 dark:text-green-400">
          {totalIncome.toFixed(2)} €
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Gesamtausgaben {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
        </h3>
        <p className="text-3xl font-bold text-red-600 dark:text-red-400">
          {totalExpenses.toFixed(2)} €
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Bilanz {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
        </h3>
        <p
          className={`text-3xl font-bold ${
            balance >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {balance >= 0 ? '+' : ''}{balance.toFixed(2)} €
        </p>
      </div>
    </div>
  )
}

export default BudgetSummary
