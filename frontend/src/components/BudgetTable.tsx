import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { categoryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry, TaxEntry, SalaryReduction } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'
import CategoryRow from './CategoryRow'
import TaxesSection from './TaxesSection'
import SalaryReductionsSection from './SalaryReductionsSection'

interface BudgetTableProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  taxEntries: TaxEntry[]
  salaryReductions: SalaryReduction[]
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

function BudgetTable({ budgetId, categories, entries, taxEntries, salaryReductions, selectedMonth, displayCurrency, budgetYear }: BudgetTableProps) {
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
        custom_start_month: null,
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

  // Get gross salary amount for a specific month (Brutto)
  const getGrossSalaryForMonth = (month: number): number => {
    const salaryCategory = categories.find(
      (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
    )
    if (!salaryCategory) return 0

    // Prioritize input mode over entries
    // If YEARLY mode, always use yearly_amount / 12
    if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
      return parseFloat(salaryCategory.yearly_amount) / 12
    }

    // If CUSTOM mode, check if this month is a payment month
    if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
      const startMonth = salaryCategory.custom_start_month || 1
      const monthsInterval = 12 / salaryCategory.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < salaryCategory.custom_months; i++) {
        const calculatedMonth = startMonth + (i * monthsInterval)
        let paymentMonth = Math.round(calculatedMonth)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }

      if (paymentMonths.includes(month)) {
        // For CUSTOM mode, yearly_amount stores the payment amount, not the total
        return parseFloat(salaryCategory.yearly_amount)
      } else {
        return 0
      }
    }

    // For MONTHLY mode, check for entry
    if (salaryCategory.input_mode === 'MONTHLY') {
      const salaryEntry = entries.find(
        (e) => e.category === salaryCategory.id && e.month === month
      )

      if (salaryEntry) {
        return parseFloat(salaryEntry.actual_amount || salaryEntry.planned_amount)
      }
    }

    return 0
  }

  // Calculate total reductions for a month
  const getTotalReductionsForMonth = (month: number): number => {
    const grossSalary = getGrossSalaryForMonth(month)
    if (grossSalary === 0) return 0

    return salaryReductions.reduce((sum, reduction) => {
      if (!reduction.is_active) return sum
      
      if (reduction.reduction_type === 'PERCENTAGE') {
        return sum + (grossSalary * parseFloat(reduction.value)) / 100
      } else {
        return sum + parseFloat(reduction.value)
      }
    }, 0)
  }

  // Get net salary (gross - reductions) for a month
  const getNetSalaryForMonth = (month: number): number => {
    const gross = getGrossSalaryForMonth(month)
    const reductions = getTotalReductionsForMonth(month)
    return Math.max(0, gross - reductions)
  }

  // Calculate tax amount for a tax entry in a specific month (uses gross salary)
  const calculateTaxAmount = (tax: TaxEntry, month: number): number => {
    const grossSalary = getGrossSalaryForMonth(month)
    if (grossSalary === 0) return 0
    return (grossSalary * parseFloat(tax.percentage)) / 100
  }

  // Calculate monthly totals (income, expenses, balance) for a specific month
  const calculateMonthlyTotals = (month: number) => {
    let income = 0
    let expenses = 0

    categories.forEach((category) => {
      let categoryAmount = 0

      // For YEARLY and CUSTOM modes, calculate based on input mode
      if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
        const yearlyAmount = parseFloat(category.yearly_amount || '0')
        
        if (category.input_mode === 'YEARLY') {
          // Distribute evenly across 12 months
          categoryAmount = yearlyAmount / 12
        } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
          // For CUSTOM mode, check if this month is a payment month
          const startMonth = category.custom_start_month || 1
          const monthsInterval = 12 / category.custom_months
          const paymentMonths: number[] = []
          for (let i = 0; i < category.custom_months; i++) {
            const calculatedMonth = startMonth + (i * monthsInterval)
            let paymentMonth = Math.round(calculatedMonth)
            while (paymentMonth > 12) paymentMonth -= 12
            while (paymentMonth < 1) paymentMonth += 12
            paymentMonths.push(paymentMonth)
          }
          
          if (paymentMonths.includes(month)) {
            // This month has a payment, show the payment amount (yearly_amount stores payment amount, not total)
            categoryAmount = yearlyAmount
          } else {
            // No payment this month
            categoryAmount = 0
          }
        }
      } else {
        // For MONTHLY mode, get the entry for this month
        const categoryEntries = entries.filter(
          (e) => e.category === category.id && e.month === month
        )
        categoryAmount = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.actual_amount || entry.planned_amount)
        }, 0)
      }

      // Add to appropriate total
      if (category.category_type === 'INCOME') {
        // For salary category, use net salary (gross - reductions)
        if (category.name.toLowerCase().includes('gehalt')) {
          income += getNetSalaryForMonth(month)
        } else {
          income += categoryAmount
        }
      } else {
        expenses += categoryAmount
      }
    })

    // Note: Salary reductions (Gehaltsabzüge) are NOT included in expenses
    // They are already deducted from gross salary to calculate net salary (income)
    // Including them here would double-count them

    // Add tax expenses
    taxEntries.forEach((tax) => {
      if (tax.is_active) {
        expenses += calculateTaxAmount(tax, month)
      }
    })

    return {
      income,
      expenses,
      balance: income - expenses,
    }
  }

  const displayMonths = selectedMonth ? [selectedMonth] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div className="w-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-700">
              <th className="px-4 py-4 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 sticky left-0 bg-slate-100 dark:bg-slate-700 z-10 min-w-[180px]">
                Kategorie
              </th>
              <th className="px-4 py-4 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[100px]">
                Typ
              </th>
              {displayMonths.map((month) => (
                <th
                  key={month}
                  className="px-3 py-4 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[110px]"
                >
                  {MONTHS[month - 1]}
                </th>
              ))}
              <th className="px-4 py-4 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[120px]">
                Gesamt
              </th>
              <th className="px-4 py-4 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[80px]">
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
                  salaryReductions={salaryReductions || []}
                />
              )
            })}
            {/* Taxes Section */}
            <SalaryReductionsSection
              budgetId={budgetId}
              salaryReductions={salaryReductions || []}
              categories={categories}
              entries={entries}
              displayMonths={displayMonths}
              displayCurrency={displayCurrency}
              budgetYear={budgetYear}
            />
            <TaxesSection
              budgetId={budgetId}
              taxEntries={taxEntries || []}
              categories={categories}
              entries={entries}
              displayMonths={displayMonths}
              displayCurrency={displayCurrency}
              budgetYear={budgetYear}
            />
            {/* Monthly Summary Row */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-t-4 border-slate-400 dark:border-slate-500">
              <td className="px-4 py-4 text-sm font-bold text-slate-900 dark:text-white sticky left-0 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-r border-slate-300 dark:border-slate-600 z-10">
                Monatliche Bilanz
              </td>
              <td className="px-3 py-4 text-center text-xs text-slate-600 dark:text-slate-400">
                -
              </td>
              {displayMonths.map((month) => {
                const totals = calculateMonthlyTotals(month)
                return (
                  <td
                    key={month}
                    className="px-3 py-4 text-center border-l border-r border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-800/30"
                  >
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                        <div className="flex items-center justify-center gap-1">
                          <span>💰</span>
                          <span className="text-[9px] opacity-75">Einnahme:</span>
                        </div>
                        <div className="mt-0.5">{formatCurrency(totals.income, displayCurrency)}</div>
                      </div>
                      <div className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                        <div className="flex items-center justify-center gap-1">
                          <span>💸</span>
                          <span className="text-[9px] opacity-75">Ausgabe:</span>
                        </div>
                        <div className="mt-0.5">{formatCurrency(totals.expenses, displayCurrency)}</div>
                      </div>
                      <div
                        className={`text-xs font-bold pt-1 border-t border-slate-300 dark:border-slate-600 ${
                          totals.balance >= 0
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-orange-700 dark:text-orange-400'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>{totals.balance >= 0 ? '📈' : '📉'}</span>
                          <span className="text-[9px] opacity-75">Bilanz:</span>
                        </div>
                        <div className="mt-0.5">
                          {totals.balance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totals.balance), displayCurrency)}
                        </div>
                      </div>
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-4 text-center text-sm font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50">
                -
              </td>
              <td className="px-3 py-4 text-center">
                -
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Add Category Section */}
      <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        {isAddingCategory ? (
            <div className="space-y-4 max-w-2xl">
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
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
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
                      className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-left text-slate-900 dark:text-white font-medium"
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
                className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm shadow-sm transition-all"
                autoFocus
              />
              <select
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value as any)}
                className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm shadow-sm transition-all"
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
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
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
                className="px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm text-sm"
              >
                ✕ Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2 text-sm"
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
