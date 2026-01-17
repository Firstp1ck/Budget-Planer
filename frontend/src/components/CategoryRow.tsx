import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  INCOME: 'Einnahmen',
  FIXED_EXPENSE: 'Fixkosten',
  VARIABLE_EXPENSE: 'Variable Kosten',
  SAVINGS: 'Sparen',
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
    },
  })

  const handleDeleteCategory = (id: number, name: string) => {
    if (confirm(`Kategorie "${name}" wirklich löschen?`)) {
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
      <tr className="bg-gray-50 dark:bg-gray-700">
        <td
          colSpan={displayMonths.length + 4}
          className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-white"
        >
          {TYPE_LABELS[type]}
        </td>
      </tr>
      {categories.map((category) => (
        <tr
          key={category.id}
          className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
        >
          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">
            {category.name}
          </td>
          <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
            {TYPE_LABELS[category.category_type]}
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
          <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
            {calculateTotal(category.id).toFixed(2)}
          </td>
          <td className="px-4 py-3 text-center">
            <button
              onClick={() => handleDeleteCategory(category.id, category.name)}
              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm"
            >
              Löschen
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}

export default CategoryRow
