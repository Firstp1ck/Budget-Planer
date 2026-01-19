import { useState } from 'react'
import type { BudgetCategory, BudgetEntry, TaxEntry, SalaryReduction, MonthlyActualBalance } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface BalanceDifferenceCardProps {
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  taxEntries: TaxEntry[]
  salaryReductions: SalaryReduction[]
  actualBalances: MonthlyActualBalance[]
  selectedMonth: number | null
  displayCurrency: Currency
  budgetYear: number
}

function BalanceDifferenceCard({
  categories,
  entries,
  taxEntries,
  salaryReductions,
  actualBalances,
  selectedMonth,
  displayCurrency,
  budgetYear,
}: BalanceDifferenceCardProps) {
  const [viewMode, setViewMode] = useState<'yearly' | 'untilCurrent'>('untilCurrent')
  
  // Get current month (1-12)
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  
  // Find the last month that has IST data
  const getLastMonthWithData = (): number | null => {
    if (currentYear !== budgetYear) {
      // For past years, find the last month with data
      const monthsWithData = actualBalances
        .filter(b => b.year === budgetYear)
        .map(b => b.month)
        .sort((a, b) => b - a)
      return monthsWithData.length > 0 ? monthsWithData[0] : null
    }
    
    // For current year, find the last month with IST data up to current month
    const monthsWithData = actualBalances
      .filter(b => b.year === budgetYear && b.month <= currentMonth)
      .map(b => b.month)
      .sort((a, b) => b - a)
    return monthsWithData.length > 0 ? monthsWithData[0] : null
  }
  
  const lastMonthWithData = getLastMonthWithData()
  const isCurrentYear = currentYear === budgetYear
  
  // Determine which months to include
  const getMonthsToInclude = (): number[] => {
    // If a specific month is selected, only show that month
    if (selectedMonth) {
      return [selectedMonth]
    }
    
    // If showing until current month
    if (viewMode === 'untilCurrent' && isCurrentYear) {
      // If we have IST data, show up to the last month with data
      // Otherwise, show up to current month (even if no data yet)
      const endMonth = lastMonthWithData !== null ? lastMonthWithData : currentMonth
      return Array.from({ length: endMonth }, (_, i) => i + 1)
    }
    
    // Otherwise show all 12 months
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  }
  // Calculate planned (SOLL) totals for a month
  const calculatePlannedTotals = (month: number) => {
    let income = 0
    let expenses = 0

    categories.forEach((category) => {
      let categoryAmount = 0

      if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
        const yearlyAmount = parseFloat(category.yearly_amount || '0')
        
        if (category.input_mode === 'YEARLY') {
          categoryAmount = yearlyAmount / 12
        } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
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
            categoryAmount = yearlyAmount
          } else {
            categoryAmount = 0
          }
        }
      } else {
        const categoryEntries = entries.filter(
          (e) => e.category === category.id && e.month === month
        )
        categoryAmount = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.planned_amount)
        }, 0)
      }

      if (category.category_type === 'INCOME') {
        if (category.name.toLowerCase().includes('gehalt')) {
          // Calculate net salary for planned
          const salaryCategory = categories.find(
            (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
          )
          if (salaryCategory) {
            let grossSalary = 0
            if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
              grossSalary = parseFloat(salaryCategory.yearly_amount) / 12
            } else if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
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
                grossSalary = parseFloat(salaryCategory.yearly_amount)
              }
            } else {
              const salaryEntry = entries.find(
                (e) => e.category === salaryCategory.id && e.month === month
              )
              if (salaryEntry) {
                grossSalary = parseFloat(salaryEntry.planned_amount)
              }
            }
            
            const reductions = salaryReductions.reduce((sum, reduction) => {
              if (!reduction.is_active) return sum
              if (reduction.reduction_type === 'PERCENTAGE') {
                return sum + (grossSalary * parseFloat(reduction.value)) / 100
              } else {
                return sum + parseFloat(reduction.value)
              }
            }, 0)
            
            income += Math.max(0, grossSalary - reductions)
          }
        } else {
          income += categoryAmount
        }
      } else {
        expenses += categoryAmount
      }
    })

    taxEntries.forEach((tax) => {
      if (tax.is_active) {
        const salaryCategory = categories.find(
          (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
        )
        if (salaryCategory) {
          let grossSalary = 0
          if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
            grossSalary = parseFloat(salaryCategory.yearly_amount) / 12
          } else if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
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
              grossSalary = parseFloat(salaryCategory.yearly_amount)
            }
          } else {
            const salaryEntry = entries.find(
              (e) => e.category === salaryCategory.id && e.month === month
            )
            if (salaryEntry) {
              grossSalary = parseFloat(salaryEntry.planned_amount)
            }
          }
          expenses += (grossSalary * parseFloat(tax.percentage)) / 100
        }
      }
    })

    return {
      income,
      expenses,
      balance: income - expenses,
    }
  }

  // Calculate actual (IST) totals
  const calculateActualTotals = () => {
    const months = getMonthsToInclude()
    
    let totalIncome = 0
    let totalExpenses = 0

    months.forEach((month) => {
      const balance = actualBalances.find(b => b.month === month && b.year === budgetYear)
      if (balance) {
        totalIncome += parseFloat(balance.actual_income)
        totalExpenses += parseFloat(balance.actual_expenses)
      }
    })

    return {
      income: totalIncome,
      expenses: totalExpenses,
      balance: totalIncome - totalExpenses,
    }
  }

  // Calculate planned (SOLL) totals
  const calculatePlannedTotalsForPeriod = () => {
    const months = getMonthsToInclude()
    
    let totalIncome = 0
    let totalExpenses = 0

    months.forEach((month) => {
      const totals = calculatePlannedTotals(month)
      totalIncome += totals.income
      totalExpenses += totals.expenses
    })

    return {
      income: totalIncome,
      expenses: totalExpenses,
      balance: totalIncome - totalExpenses,
    }
  }

  const plannedTotals = calculatePlannedTotalsForPeriod()
  const actualTotals = calculateActualTotals()
  const difference = actualTotals.balance - plannedTotals.balance
  const monthsToInclude = getMonthsToInclude()
  const showToggle = !selectedMonth && isCurrentYear

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl shadow-md border border-indigo-200 dark:border-indigo-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-xl flex items-center justify-center text-2xl shadow-md">
            📊
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Bilanz Differenz (SOLL vs IST)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {selectedMonth 
                ? `Monat ${selectedMonth}` 
                : viewMode === 'untilCurrent' && isCurrentYear
                  ? `Bis Monat ${lastMonthWithData !== null ? lastMonthWithData : currentMonth}`
                  : 'Gesamtjahr'}
            </p>
          </div>
        </div>
        
        {/* Toggle for view mode - only show when no specific month is selected and it's the current year */}
        {showToggle && (
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('untilCurrent')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                viewMode === 'untilCurrent'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Bis aktuell
            </button>
            <button
              onClick={() => setViewMode('yearly')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                viewMode === 'yearly'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Gesamtjahr
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* SOLL Balance */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            SOLL Bilanz
          </div>
          <div className={`text-2xl font-bold ${
            plannedTotals.balance >= 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-orange-600 dark:text-orange-400'
          }`}>
            {plannedTotals.balance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(plannedTotals.balance), displayCurrency)}
          </div>
        </div>

        {/* IST Balance */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            IST Bilanz
          </div>
          <div className={`text-2xl font-bold ${
            actualTotals.balance >= 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-orange-600 dark:text-orange-400'
          }`}>
            {actualTotals.balance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(actualTotals.balance), displayCurrency)}
          </div>
        </div>

        {/* Difference */}
        <div className={`bg-white dark:bg-slate-800 rounded-lg p-4 border-2 ${
          difference >= 0
            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
            : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
        }`}>
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Differenz
          </div>
          <div className={`text-2xl font-bold ${
            difference >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {difference >= 0 ? '+' : ''}{formatCurrency(difference, displayCurrency)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {difference >= 0 ? '✅ Über Plan' : '⚠️ Unter Plan'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BalanceDifferenceCard
