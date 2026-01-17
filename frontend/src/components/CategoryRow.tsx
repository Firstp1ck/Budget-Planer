import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { categoryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry } from '../types/budget'
import MonthlyCell from './MonthlyCell'

interface CategoryRowProps {
  type: string
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  displayMonths: number[]
  getEntryForCategoryAndMonth: (categoryId: number, month: number) => BudgetEntry | undefined
  budgetId: number
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: '💰 Einnahmen',
  FIXED_EXPENSE: '🏠 Fixkosten',
  VARIABLE_EXPENSE: '🛒 Variable Kosten',
  SAVINGS: '💎 Sparen',
}

const TYPE_COLORS: Record<string, string> = {
  INCOME: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  FIXED_EXPENSE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  VARIABLE_EXPENSE: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  SAVINGS: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
}

function CategoryRow({
  type,
  categories,
  entries,
  displayMonths,
  getEntryForCategoryAndMonth,
  budgetId,
}: CategoryRowProps) {
  const queryClient = useQueryClient()

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => categoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success('Kategorie gelöscht')
    },
    onError: () => {
      toast.error('Fehler beim Löschen der Kategorie')
    },
  })

  const handleDeleteCategory = (id: number, name: string) => {
    if (window.confirm(`Kategorie "${name}" wirklich löschen? Alle zugehörigen Einträge gehen verloren.`)) {
      deleteCategoryMutation.mutate(id)
    }
  }

  const calculateTotal = (categoryId: number) => {
    const categoryEntries = entries.filter((e) => e.category === categoryId)
    return categoryEntries.reduce((sum, entry) => {
      const amount = parseFloat(entry.actual_amount || entry.planned_amount)
      return sum + amount
    }, 0)
  }

  return (
    <>
      <tr className={`${TYPE_COLORS[type]} border-t-2 border-gray-300 dark:border-gray-600`}>
        <td
          colSpan={displayMonths.length + 4}
          className="px-6 py-3 text-base font-bold"
        >
          {TYPE_LABELS[type]}
        </td>
      </tr>
      {categories.map((category) => (
        <tr
          key={category.id}
          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <td className="px-6 py-4 text-base font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
            {category.name}
          </td>
          <td className="px-6 py-4 text-center">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${TYPE_COLORS[type]}`}>
              {TYPE_LABELS[category.category_type]}
            </span>
          </td>
          {displayMonths.map((month) => {
            const entry = getEntryForCategoryAndMonth(category.id, month)
            return (
              <MonthlyCell
                key={`${category.id}-${month}`}
                categoryId={category.id}
                month={month}
                entry={entry}
                budgetId={budgetId}
              />
            )
          })}
          <td className="px-6 py-4 text-center text-base font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50">
            {calculateTotal(category.id).toFixed(2)} €
          </td>
          <td className="px-6 py-4 text-center">
            <button
              onClick={() => handleDeleteCategory(category.id, category.name)}
              disabled={deleteCategoryMutation.isPending}
              className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all text-sm font-semibold disabled:opacity-50"
              title="Kategorie löschen"
            >
              🗑️ Löschen
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}

export default CategoryRow
