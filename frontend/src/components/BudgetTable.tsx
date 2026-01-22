import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { categoryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry, TaxEntry, SalaryReduction, MonthlyActualBalance } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'
import CategoryRow from './CategoryRow'
import TaxesSection from './TaxesSection'
import SalaryReductionsSection from './SalaryReductionsSection'
import ActualBalanceCell from './ActualBalanceCell'

interface BudgetTableProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  taxEntries: TaxEntry[]
  salaryReductions: SalaryReduction[]
  selectedMonth: number | null
  displayCurrency: Currency
  budgetYear: number
  actualBalances?: MonthlyActualBalance[]
}

function BudgetTable({ budgetId, categories, entries, taxEntries, salaryReductions, selectedMonth, displayCurrency, budgetYear, actualBalances = [] }: BudgetTableProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS'>('VARIABLE_EXPENSE')
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)
  
  // Month names from translations
  const MONTHS = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec')
  ]
  
  // Global collapse state for all groups
  const [collapseStates, setCollapseStates] = useState<Record<string, boolean>>({
    INCOME: false,
    FIXED_EXPENSE: false,
    VARIABLE_EXPENSE: false,
    SAVINGS: false,
    TAXES: false,
    SALARY_REDUCTIONS: false,
    MONTHLY_BALANCE: false,
  })
  
  const handleCollapseChange = (group: string, collapsed: boolean) => {
    setCollapseStates(prev => ({ ...prev, [group]: collapsed }))
  }
  
  const toggleAllGroups = () => {
    const allCollapsed = Object.values(collapseStates).every(v => v === true)
    const newState = allCollapsed ? false : true
    setCollapseStates({
      INCOME: newState,
      FIXED_EXPENSE: newState,
      VARIABLE_EXPENSE: newState,
      SAVINGS: newState,
      TAXES: newState,
      SALARY_REDUCTIONS: newState,
      MONTHLY_BALANCE: newState,
    })
  }
  
  const allCollapsed = Object.values(collapseStates).every(v => v === true)

  const getActualBalanceForMonth = (month: number): MonthlyActualBalance | undefined => {
    return actualBalances.find(b => b.month === month && b.year === budgetYear)
  }

  const addCategoryMutation = useMutation({
    mutationFn: (data: Partial<BudgetCategory>) => categoryApi.create(budgetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsAddingCategory(false)
      setNewCategoryName('')
      toast.success(t('category.addSuccess'))
    },
    onError: () => {
      toast.error(t('category.addError'))
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
      toast.error(t('category.enterName'))
    }
  }

  const handleAddCategoryFromGroup = (type: string) => {
    setNewCategoryType(type as 'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS')
    setNewCategoryName('')
    setIsAddingCategory(true)
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
      {/* Add Category Section */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            onClick={toggleAllGroups}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95 border border-blue-500/20"
            title={allCollapsed ? t('common.expandAll') : t('common.collapseAll')}
          >
            <span className={`text-lg transition-transform duration-200 ${allCollapsed ? 'rotate-0' : 'rotate-90'}`}>
              ▶
            </span>
            <span>{allCollapsed ? t('common.expandAll') : t('common.collapseAll')}</span>
          </button>
          {!isAddingCategory && (
            <button
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95 border border-green-500/20"
            >
              <span className="text-xl font-bold">+</span>
              <span>{t('category.addCategory')}</span>
            </button>
          )}
        </div>
        {isAddingCategory ? (
            <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('category.addNew')}
              </h3>
              <button
                onClick={() => setShowCategorySuggestions(!showCategorySuggestions)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                💡 {showCategorySuggestions ? t('category.hideSuggestions') : t('category.showSuggestions')}
              </button>
            </div>

            {showCategorySuggestions && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                {(['INCOME', 'FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'SAVINGS'] as const).map((type) => (
                  <div key={type} className="space-y-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
                      {t(`categoryTypes.${type}`)}
                    </div>
                    {(t(`categorySuggestions.${type}`, { returnObjects: true }) as string[]).map((catName: string) => (
                      <button
                        key={catName}
                        onClick={() => {
                          setNewCategoryName(catName)
                          setNewCategoryType(type)
                        }}
                        className="w-full text-left px-3 py-2 text-sm bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-md transition-colors text-slate-700 dark:text-slate-300"
                      >
                        {catName}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('category.categoryName')} *
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCategory()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setIsAddingCategory(false)
                      setNewCategoryName('')
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder={t('category.namePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('common.type')} *
                </label>
                <select
                  value={newCategoryType}
                  onChange={(e) => setNewCategoryType(e.target.value as 'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCategory()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setIsAddingCategory(false)
                      setNewCategoryName('')
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="INCOME">{t('categoryTypes.INCOME')}</option>
                  <option value="FIXED_EXPENSE">{t('categoryTypes.FIXED_EXPENSE')}</option>
                  <option value="VARIABLE_EXPENSE">{t('categoryTypes.VARIABLE_EXPENSE')}</option>
                  <option value="SAVINGS">{t('categoryTypes.SAVINGS')}</option>
                </select>
              </div>
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
                    {t('category.saving')}
                  </span>
                ) : (
                  `✓ ${t('common.save')}`
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
                ✕ {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-700">
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 sticky left-0 bg-slate-100 dark:bg-slate-700 z-10 min-w-[180px]">
                {t('table.category')}
              </th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[100px]">
                {t('common.type')}
              </th>
              {displayMonths.map((month) => (
                <th
                  key={month}
                  className="px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[110px]"
                >
                  {MONTHS[month - 1]}
                </th>
              ))}
              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[120px]">
                {t('common.total')}
              </th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 min-w-[80px]">
                {t('common.actions')}
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
                  isCollapsed={collapseStates[type]}
                  onCollapseChange={(collapsed) => handleCollapseChange(type, collapsed)}
                  onAddCategory={handleAddCategoryFromGroup}
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
              isCollapsed={collapseStates.SALARY_REDUCTIONS}
              onCollapseChange={(collapsed) => handleCollapseChange('SALARY_REDUCTIONS', collapsed)}
            />
            <TaxesSection
              budgetId={budgetId}
              taxEntries={taxEntries || []}
              categories={categories}
              entries={entries}
              displayMonths={displayMonths}
              displayCurrency={displayCurrency}
              budgetYear={budgetYear}
              isCollapsed={collapseStates.TAXES}
              onCollapseChange={(collapsed) => handleCollapseChange('TAXES', collapsed)}
            />
            {/* Monthly Balance Header */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50">
              <td
                colSpan={displayMonths.length + 4}
                className="px-4 py-2 text-sm font-bold text-slate-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleCollapseChange('MONTHLY_BALANCE', !collapseStates.MONTHLY_BALANCE)}
                    className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-slate-300 dark:border-slate-600"
                    title={collapseStates.MONTHLY_BALANCE ? t('common.expand') : t('common.collapse')}
                    aria-label={collapseStates.MONTHLY_BALANCE ? t('common.expand') : t('common.collapse')}
                  >
                    <span className={`text-sm transition-transform duration-200 ${collapseStates.MONTHLY_BALANCE ? 'rotate-0' : 'rotate-90'}`}>
                      ▶
                    </span>
                  </button>
                  <span>📊 {t('table.monthlyBalance')}</span>
                </div>
              </td>
            </tr>
            {!collapseStates.MONTHLY_BALANCE && (
              <>
            {/* Monthly Summary Row */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-t-2 border-slate-400 dark:border-slate-500">
              <td className="px-4 py-2 text-sm font-bold text-slate-900 dark:text-white sticky left-0 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-r border-slate-300 dark:border-slate-600 z-10">
                {t('table.monthlyBalancePlanned')}
              </td>
              <td className="px-3 py-2 text-center text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-600">
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-green-700 dark:text-green-400">
                    <div className="flex items-center justify-center gap-1">
                      <span>💰</span>
                      <span className="opacity-75">{t('summary.income')}</span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">
                    <div className="flex items-center justify-center gap-1">
                      <span>💸</span>
                      <span className="opacity-75">{t('summary.expenses')}</span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-blue-700 dark:text-blue-400 pt-1 border-t border-slate-300 dark:border-slate-600">
                    <div className="flex items-center justify-center gap-1">
                      <span>📈</span>
                      <span className="opacity-75">{t('summary.balance')}</span>
                    </div>
                  </div>
                </div>
              </td>
              {displayMonths.map((month) => {
                const totals = calculateMonthlyTotals(month)
                return (
                  <td
                    key={month}
                    className="px-3 py-2 text-center border-l border-r border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-800/30"
                  >
                    <div className="space-y-1.5">
                      <div className="text-sm font-semibold text-green-700 dark:text-green-400">
                        <div className="mt-0.5">{formatCurrency(totals.income, displayCurrency)}</div>
                      </div>
                      <div className="text-sm font-semibold text-red-700 dark:text-red-400">
                        <div className="mt-0.5">{formatCurrency(totals.expenses, displayCurrency)}</div>
                      </div>
                      <div
                        className={`text-sm font-bold pt-1 border-t border-slate-300 dark:border-slate-600 ${
                          totals.balance >= 0
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-orange-700 dark:text-orange-400'
                        }`}
                      >
                        <div className="mt-0.5">
                          {totals.balance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totals.balance), displayCurrency)}
                        </div>
                      </div>
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50">
              </td>
              <td className="px-3 py-2 text-center">
              </td>
            </tr>
            {/* Actual Balance Section - Income Row */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-t-2 border-slate-400 dark:border-slate-500">
              <td className="px-4 py-2 text-sm font-bold text-slate-900 dark:text-white sticky left-0 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-r border-slate-300 dark:border-slate-600 z-10" rowSpan={3}>
                {t('table.monthlyBalanceActual')}
              </td>
              <td className="px-3 py-2 text-center text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-center gap-1">
                  <span>💰</span>
                  <span className="opacity-75 font-semibold text-green-700 dark:text-green-400">{t('summary.income')}</span>
                </div>
              </td>
              {displayMonths.map((month) => {
                const balance = getActualBalanceForMonth(month)
                return (
                  <ActualBalanceCell
                    key={month}
                    month={month}
                    balance={balance}
                    budgetId={budgetId}
                    budgetYear={budgetYear}
                    displayCurrency={displayCurrency}
                    field="income"
                  />
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50">
              </td>
              <td className="px-3 py-2 text-center">
              </td>
            </tr>
            {/* Actual Balance Section - Expenses Row */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50">
              <td className="px-3 py-2 text-center text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-center gap-1">
                  <span>💸</span>
                  <span className="opacity-75 font-semibold text-red-700 dark:text-red-400">{t('summary.expenses')}</span>
                </div>
              </td>
              {displayMonths.map((month) => {
                const balance = getActualBalanceForMonth(month)
                return (
                  <ActualBalanceCell
                    key={month}
                    month={month}
                    balance={balance}
                    budgetId={budgetId}
                    budgetYear={budgetYear}
                    displayCurrency={displayCurrency}
                    field="expenses"
                  />
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50">
              </td>
              <td className="px-3 py-2 text-center">
              </td>
            </tr>
            {/* Actual Balance Section - Balance Row */}
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 border-b-2 border-slate-400 dark:border-slate-500">
              <td className="px-3 py-2 text-center text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-center gap-1">
                  <span>📈</span>
                  <span className="opacity-75 font-semibold text-blue-700 dark:text-blue-400">{t('summary.balance')}</span>
                </div>
              </td>
              {displayMonths.map((month) => {
                const balance = getActualBalanceForMonth(month)
                const actualIncome = balance ? parseFloat(balance.actual_income) : 0
                const actualExpenses = balance ? parseFloat(balance.actual_expenses) : 0
                const actualBalance = actualIncome - actualExpenses
                return (
                  <td
                    key={month}
                    className="px-3 py-2 text-center border-l border-r border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-800/30"
                  >
                    <div
                      className={`text-sm font-bold ${
                        actualBalance >= 0
                          ? 'text-blue-700 dark:text-blue-400'
                          : 'text-orange-700 dark:text-orange-400'
                      }`}
                    >
                      {actualBalance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(actualBalance), displayCurrency)}
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50">
              </td>
              <td className="px-3 py-2 text-center">
              </td>
            </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BudgetTable
