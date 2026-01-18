import type { BudgetCategory, BudgetEntry, SalaryReduction } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface BudgetSummaryProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  salaryReductions: SalaryReduction[]
  selectedMonth: number | null
  displayCurrency: Currency
}

function BudgetSummary({ categories, entries, salaryReductions, selectedMonth, displayCurrency }: BudgetSummaryProps) {
  // Get gross salary for a specific month
  const getGrossSalaryForMonth = (month: number): number => {
    const salaryCategory = categories.find(
      (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
    )
    if (!salaryCategory) return 0

    // Prioritize input mode over entries
    if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
      return parseFloat(salaryCategory.yearly_amount) / 12
    }

    if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
      const monthsInterval = 12 / salaryCategory.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < salaryCategory.custom_months; i++) {
        const calculatedMonth = 1 + (i * monthsInterval)
        let paymentMonth = Math.round(calculatedMonth)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }

      if (paymentMonths.includes(month)) {
        return parseFloat(salaryCategory.yearly_amount) / salaryCategory.custom_months
      } else {
        return 0
      }
    }

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

  const calculateTotals = () => {
    let totalIncome = 0
    let totalExpenses = 0

    categories.forEach((category) => {
      let categoryTotal = 0

      // For salary category, use net salary (gross - reductions)
      if (category.category_type === 'INCOME' && category.name.toLowerCase().includes('gehalt')) {
        if (selectedMonth) {
          // Single month: use net salary for that month
          categoryTotal = getNetSalaryForMonth(selectedMonth)
        } else {
          // Yearly: sum net salary for all 12 months
          for (let month = 1; month <= 12; month++) {
            categoryTotal += getNetSalaryForMonth(month)
          }
        }
      } else {
        // For other categories, calculate normally
        // For YEARLY and CUSTOM modes, calculate based on input mode
        if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
          const yearlyAmount = parseFloat(category.yearly_amount || '0')

          if (selectedMonth) {
            // For single month view, show the monthly calculated amount
            if (category.input_mode === 'YEARLY') {
              categoryTotal = yearlyAmount / 12
            } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
              // For CUSTOM mode, check if this month is a payment month
              const monthsInterval = 12 / category.custom_months
              const paymentMonths: number[] = []
              for (let i = 0; i < category.custom_months; i++) {
                const calculatedMonth = 1 + (i * monthsInterval)
                let paymentMonth = Math.round(calculatedMonth)
                while (paymentMonth > 12) paymentMonth -= 12
                while (paymentMonth < 1) paymentMonth += 12
                paymentMonths.push(paymentMonth)
              }
              
              if (paymentMonths.includes(selectedMonth)) {
                categoryTotal = yearlyAmount / category.custom_months
              } else {
                categoryTotal = 0
              }
            }
          } else {
            // For yearly view, show the full amount
            categoryTotal = yearlyAmount
          }
        } else {
          // For MONTHLY mode, sum actual entries
          const categoryEntries = selectedMonth
            ? entries.filter((e) => e.category === category.id && e.month === selectedMonth)
            : entries.filter((e) => e.category === category.id)

          categoryTotal = categoryEntries.reduce((sum, entry) => {
            return sum + parseFloat(entry.actual_amount || entry.planned_amount)
          }, 0)
        }
      }

      // Add to appropriate total
      if (category.category_type === 'INCOME') {
        totalIncome += categoryTotal
      } else {
        // Note: Salary reductions (Gehaltsabzüge) are NOT included in expenses
        // because they are already deducted from gross salary to calculate net salary
        totalExpenses += categoryTotal
      }
    })

    // Note: Salary reductions are NOT added to expenses here because:
    // - They are already deducted from gross salary to get net salary (which is used for income)
    // - Salary reductions are not expenses, they are deductions from income
    // - Taxes are also not included here (they would need to be added separately if desired)

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
    }
  }

  const { totalIncome, totalExpenses, balance } = calculateTotals()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
      <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl shadow-md p-7 border border-green-200 dark:border-green-700/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">💰</div>
          <h3 className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
            Gesamteinnahmen {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
          </h3>
        </div>
        <p className="text-4xl font-bold text-green-700 dark:text-green-300">
          {formatCurrency(totalIncome, displayCurrency)}
        </p>
      </div>

      <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl shadow-md p-7 border border-red-200 dark:border-red-700/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">💸</div>
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
            Gesamtausgaben {selectedMonth ? `(Monat ${selectedMonth})` : '(Jahr)'}
          </h3>
        </div>
        <p className="text-4xl font-bold text-red-700 dark:text-red-300">
          {formatCurrency(totalExpenses, displayCurrency)}
        </p>
      </div>

      <div className={`bg-gradient-to-br rounded-xl shadow-md p-7 border backdrop-blur-sm ${
        balance >= 0
          ? 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50'
          : 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50'
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
          {balance >= 0 ? '+' : ''}{formatCurrency(Math.abs(balance), displayCurrency)}
        </p>
      </div>
    </div>
  )
}

export default BudgetSummary
