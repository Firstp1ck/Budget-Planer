import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoryApi, entryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry } from '../types/budget'
import CategoryRow from './CategoryRow'

interface BudgetTableProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  selectedMonth: number | null
}

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
]

function BudgetTable({ budgetId, categories, entries, selectedMonth }: BudgetTableProps) {
  const queryClient = useQueryClient()
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS'>('VARIABLE_EXPENSE')

  const addCategoryMutation = useMutation({
    mutationFn: (data: Partial<BudgetCategory>) => categoryApi.create(budgetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsAddingCategory(false)
      setNewCategoryName('')
    },
  })

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategoryMutation.mutate({
        name: newCategoryName,
        category_type: newCategoryType,
        order: categories.length,
        is_active: true,
      })
    }
  }

  const getEntryForCategoryAndMonth = (categoryId: number, month: number) => {
    return entries.find(
      (e) => e.category === categoryId && e.month === month
    )
  }

  const displayMonths = selectedMonth ? [selectedMonth] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600 sticky left-0 bg-gray-100 dark:bg-gray-700 z-10">
                Kategorie
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600">
                Typ
              </th>
              {displayMonths.map((month) => (
                <th
                  key={month}
                  className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600 min-w-[120px]"
                >
                  {MONTHS[month - 1]}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600">
                Gesamt
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody>
            {['INCOME', 'FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'SAVINGS'].map((type) => {
              const categoryGroup = categories.filter((c) => c.category_type === type)
              if (categoryGroup.length === 0) return null

              return (
                <CategoryRow
                  key={type}
                  type={type}
                  categories={categoryGroup}
                  entries={entries}
                  displayMonths={displayMonths}
                  getEntryForCategoryAndMonth={getEntryForCategoryAndMonth}
                  budgetId={budgetId}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t dark:border-gray-700">
        {isAddingCategory ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Kategoriename"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <select
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="INCOME">Einnahme</option>
                <option value="FIXED_EXPENSE">Fixkosten</option>
                <option value="VARIABLE_EXPENSE">Variable Kosten</option>
                <option value="SAVINGS">Sparen</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddCategory}
                disabled={addCategoryMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addCategoryMutation.isPending ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={() => {
                  setIsAddingCategory(false)
                  setNewCategoryName('')
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Kategorie hinzufügen
          </button>
        )}
      </div>
    </div>
  )
}

export default BudgetTable
