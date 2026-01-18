import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { categoryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry } from '../types/budget'
import { Currency } from '../utils/currency'
import CategoryRow from './CategoryRow'

interface BudgetTableProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  selectedMonth: number | null
  displayCurrency: Currency
  budgetYear: number
}

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
]

// Common category suggestions
const COMMON_CATEGORIES: Record<string, { name: string; type: 'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS' }[]> = {
  INCOME: [
    { name: 'Gehalt', type: 'INCOME' },
    { name: '13. Monatslohn', type: 'INCOME' },
    { name: 'Bonus', type: 'INCOME' },
    { name: 'Nebenverdienst', type: 'INCOME' },
    { name: 'Kapitalerträge', type: 'INCOME' },
  ],
  FIXED_EXPENSE: [
    { name: 'Miete', type: 'FIXED_EXPENSE' },
    { name: 'Krankenversicherung', type: 'FIXED_EXPENSE' },
    { name: 'Strom', type: 'FIXED_EXPENSE' },
    { name: 'Internet/Telefon', type: 'FIXED_EXPENSE' },
    { name: 'Auto/Verkehr', type: 'FIXED_EXPENSE' },
    { name: 'Versicherungen', type: 'FIXED_EXPENSE' },
    { name: 'Steuern', type: 'FIXED_EXPENSE' },
  ],
  VARIABLE_EXPENSE: [
    { name: 'Lebensmittel', type: 'VARIABLE_EXPENSE' },
    { name: 'Restaurant', type: 'VARIABLE_EXPENSE' },
    { name: 'Kleidung', type: 'VARIABLE_EXPENSE' },
    { name: 'Freizeit', type: 'VARIABLE_EXPENSE' },
    { name: 'Sport', type: 'VARIABLE_EXPENSE' },
    { name: 'Geschenke', type: 'VARIABLE_EXPENSE' },
    { name: 'Haushalt', type: 'VARIABLE_EXPENSE' },
  ],
  SAVINGS: [
    { name: 'Notfallfonds', type: 'SAVINGS' },
    { name: 'Altersvorsorge', type: 'SAVINGS' },
    { name: 'Sparen', type: 'SAVINGS' },
    { name: 'Investitionen', type: 'SAVINGS' },
  ],
}

function BudgetTable({ budgetId, categories, entries, selectedMonth, displayCurrency, budgetYear }: BudgetTableProps) {
  const queryClient = useQueryClient()
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS'>('VARIABLE_EXPENSE')
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)

  const addCategoryMutation = useMutation({
    mutationFn: (data: Partial<BudgetCategory>) => categoryApi.create(budgetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsAddingCategory(false)
      setNewCategoryName('')
      toast.success('Kategorie erfolgreich hinzugefügt!')
    },
    onError: () => {
      toast.error('Fehler beim Hinzufügen der Kategorie')
    },
  })

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategoryMutation.mutate({
        name: newCategoryName,
        category_type: newCategoryType,
        order: categories.length,
        is_active: true,
        input_mode: 'MONTHLY',
        custom_months: null,
        yearly_amount: null,
      })
    } else {
      toast.error('Bitte geben Sie einen Kategorienamen ein')
    }
  }

  const getEntryForCategoryAndMonth = (categoryId: number, month: number) => {
    return entries.find(
      (e) => e.category === categoryId && e.month === month
    )
  }

  const displayMonths = selectedMonth ? [selectedMonth] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600">
              <th className="px-6 py-4 text-left text-sm font-bold text-gray-800 dark:text-gray-200 border-b-2 border-gray-300 dark:border-gray-500 sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 min-w-[200px]">
                Kategorie
              </th>
              <th className="px-6 py-4 text-center text-sm font-bold text-gray-800 dark:text-gray-200 border-b-2 border-gray-300 dark:border-gray-500 min-w-[120px]">
                Typ
              </th>
              {displayMonths.map((month) => (
                <th
                  key={month}
                  className="px-6 py-4 text-center text-sm font-bold text-gray-800 dark:text-gray-200 border-b-2 border-gray-300 dark:border-gray-500 min-w-[140px]"
                >
                  {MONTHS[month - 1]}
                </th>
              ))}
              <th className="px-6 py-4 text-center text-sm font-bold text-gray-800 dark:text-gray-200 border-b-2 border-gray-300 dark:border-gray-500 min-w-[140px]">
                Gesamt
              </th>
              <th className="px-6 py-4 text-center text-sm font-bold text-gray-800 dark:text-gray-200 border-b-2 border-gray-300 dark:border-gray-500 min-w-[100px]">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
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
                  displayCurrency={displayCurrency}
                  budgetYear={budgetYear}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add Category Section */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
        {isAddingCategory ? (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Neue Kategorie hinzufügen
              </h3>
              <button
                onClick={() => setShowCategorySuggestions(!showCategorySuggestions)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                💡 {showCategorySuggestions ? 'Vorschläge ausblenden' : 'Vorschläge anzeigen'}
              </button>
            </div>

            {showCategorySuggestions && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Häufige Kategorien für {newCategoryType === 'INCOME' ? 'Einnahmen' : newCategoryType === 'FIXED_EXPENSE' ? 'Fixkosten' : newCategoryType === 'VARIABLE_EXPENSE' ? 'Variable Kosten' : 'Sparen'}:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COMMON_CATEGORIES[newCategoryType].map((suggestion) => (
                    <button
                      key={suggestion.name}
                      onClick={() => {
                        setNewCategoryName(suggestion.name)
                        setShowCategorySuggestions(false)
                      }}
                      className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-left"
                    >
                      {suggestion.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Kategoriename (z.B. Gehalt, Miete)"
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-base"
                autoFocus
              />
              <select
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value as any)}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-base"
              >
                <option value="INCOME">💰 Einnahme</option>
                <option value="FIXED_EXPENSE">🏠 Fixkosten</option>
                <option value="VARIABLE_EXPENSE">🛒 Variable Kosten</option>
                <option value="SAVINGS">💎 Sparen</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddCategory}
                disabled={addCategoryMutation.isPending}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {addCategoryMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Speichern...
                  </span>
                ) : (
                  '✓ Speichern'
                )}
              </button>
              <button
                onClick={() => {
                  setIsAddingCategory(false)
                  setNewCategoryName('')
                }}
                disabled={addCategoryMutation.isPending}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all font-semibold disabled:opacity-50"
              >
                ✕ Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            Kategorie hinzufügen
          </button>
        )}
      </div>
    </div>
  )
}

export default BudgetTable
