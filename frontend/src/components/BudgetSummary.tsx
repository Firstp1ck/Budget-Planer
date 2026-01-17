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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-2xl shadow-lg p-8 border-2 border-green-200 dark:border-green-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">💰</div>
          <h3 className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
            Gesamteinnahmen {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
          </h3>
        </div>
        <p className="text-4xl font-bold text-green-700 dark:text-green-300">
          {totalIncome.toFixed(2)} €
        </p>
      </div>

      <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-2xl shadow-lg p-8 border-2 border-red-200 dark:border-red-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">💸</div>
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
            Gesamtausgaben {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
          </h3>
        </div>
        <p className="text-4xl font-bold text-red-700 dark:text-red-300">
          {totalExpenses.toFixed(2)} €
        </p>
      </div>

      <div className={`bg-gradient-to-br rounded-2xl shadow-lg p-8 border-2 ${
        balance >= 0
          ? 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700'
          : 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-700'
      }`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">{balance >= 0 ? '📈' : '📉'}</div>
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${
            balance >= 0
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-orange-700 dark:text-orange-300'
          }`}>
            Bilanz {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
          </h3>
        </div>
        <p className={`text-4xl font-bold ${
          balance >= 0
            ? 'text-blue-700 dark:text-blue-300'
            : 'text-orange-700 dark:text-orange-300'
        }`}>
          {balance >= 0 ? '+' : ''}{balance.toFixed(2)} €
        </p>
      </div>
    </div>
  )
}

export default BudgetSummary
