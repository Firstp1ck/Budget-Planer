import { useState } from 'react'
import type { BudgetCategory, BudgetEntry, SalaryReduction, TaxEntry } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

type IncomeCalculationMode = 'gross' | 'net' | 'net_minus_taxes'

interface BudgetSummaryProps {
  budgetId: number
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  salaryReductions: SalaryReduction[]
  taxEntries: TaxEntry[]
  selectedMonth: number | null
  displayCurrency: Currency
}

function BudgetSummary({ categories, entries, salaryReductions, taxEntries, selectedMonth, displayCurrency }: BudgetSummaryProps) {
  const [incomeMode, setIncomeMode] = useState<IncomeCalculationMode>('net')
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false)
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

  // Calculate tax amount for a tax entry in a specific month
  const calculateTaxAmount = (tax: TaxEntry, month: number): number => {
    const salary = getGrossSalaryForMonth(month)
    if (salary === 0) return 0
    return (salary * parseFloat(tax.percentage)) / 100
  }

  // Calculate total taxes for a period
  const getTotalTaxes = (): number => {
    let total = 0
    if (selectedMonth) {
      taxEntries.forEach((tax) => {
        if (tax.is_active) {
          total += calculateTaxAmount(tax, selectedMonth)
        }
      })
    } else {
      for (let month = 1; month <= 12; month++) {
        taxEntries.forEach((tax) => {
          if (tax.is_active) {
            total += calculateTaxAmount(tax, month)
          }
        })
      }
    }
    return total
  }

  const calculateTotals = () => {
    let totalIncome = 0
    let totalExpenses = 0

    categories.forEach((category) => {
      let categoryTotal = 0

      // For salary category, calculate based on selected mode
      if (category.category_type === 'INCOME' && category.name.toLowerCase().includes('gehalt')) {
        if (selectedMonth) {
          // Single month
          if (incomeMode === 'gross') {
            categoryTotal = getGrossSalaryForMonth(selectedMonth)
          } else {
            categoryTotal = getNetSalaryForMonth(selectedMonth)
          }
        } else {
          // Yearly: sum for all 12 months
          let salarySum = 0
          for (let month = 1; month <= 12; month++) {
            if (incomeMode === 'gross') {
              salarySum += getGrossSalaryForMonth(month)
            } else {
              salarySum += getNetSalaryForMonth(month)
            }
          }
          categoryTotal = salarySum
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
              
              if (paymentMonths.includes(selectedMonth)) {
                // For CUSTOM mode, yearly_amount stores the payment amount, not the total
                categoryTotal = yearlyAmount
              } else {
                categoryTotal = 0
              }
            }
          } else {
            // For yearly view
            if (category.input_mode === 'YEARLY') {
              categoryTotal = yearlyAmount
            } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
              // For CUSTOM mode, yearly_amount stores the payment amount, so multiply by custom_months for total
              categoryTotal = yearlyAmount * category.custom_months
            }
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

    // Handle salary reductions and taxes based on income calculation mode
    const totalTaxes = getTotalTaxes()
    
    // Calculate total salary reductions
    let totalReductions = 0
    if (selectedMonth) {
      totalReductions = getTotalReductionsForMonth(selectedMonth)
    } else {
      for (let month = 1; month <= 12; month++) {
        totalReductions += getTotalReductionsForMonth(month)
      }
    }
    
    if (incomeMode === 'gross') {
      // Mode 1: Brutto + alles andere
      // Salary reductions are added to expenses (since they're not deducted from income)
      totalExpenses += totalReductions
      // Taxes are added to expenses
      totalExpenses += totalTaxes
    } else if (incomeMode === 'net_minus_taxes') {
      // Mode 3: Netto - Steuern + alles andere
      // Salary reductions are already deducted from income (net salary)
      // Taxes are deducted from income, not added to expenses
      totalIncome -= totalTaxes
    } else {
      // Mode 2: Netto + alles andere (default)
      // Salary reductions are already deducted from income (net salary)
      // Taxes are added to expenses
      totalExpenses += totalTaxes
    }

    return {
      totalIncome,
      totalExpenses, // Includes categories (Fixkosten, Variable Kosten, Sparen) + taxes (unless mode 3), but NOT salary reductions
      balance: totalIncome - totalExpenses,
    }
  }

  const { totalIncome, totalExpenses, balance } = calculateTotals()

  return (
    <div className="mb-6">
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-gray-300 dark:border-gray-600"
            title={isSummaryCollapsed ? 'Aufklappen' : 'Zuklappen'}
            aria-label={isSummaryCollapsed ? 'Aufklappen' : 'Zuklappen'}
          >
            <span className={`text-sm transition-transform duration-200 ${isSummaryCollapsed ? 'rotate-0' : 'rotate-90'}`}>
              ▶
            </span>
          </button>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Zusammenfassung
          </h2>
        </div>
        
        {!isSummaryCollapsed && (
          <>
            {/* Income Mode Selector - only show for yearly view */}
            {!selectedMonth && (
              <div className="mb-6 p-4 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                  Berechnungsmodus für Gesamteinnahmen:
                </label>
                <select
                  value={incomeMode}
                  onChange={(e) => setIncomeMode(e.target.value as IncomeCalculationMode)}
                  className="w-full md:w-auto px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-600 text-slate-900 dark:text-white text-sm cursor-pointer"
                >
                  <option value="gross">Brutto + alles andere</option>
                  <option value="net">Netto + alles andere</option>
                  <option value="net_minus_taxes">Netto - Steuern + alles andere</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {incomeMode === 'gross' && 'Brutto-Gehalt wird verwendet (ohne Abzüge)'}
                  {incomeMode === 'net' && 'Netto-Gehalt wird verwendet (Brutto - Abzüge)'}
                  {incomeMode === 'net_minus_taxes' && 'Netto-Gehalt - Steuern wird verwendet (Steuern werden von Einnahmen abgezogen, nicht zu Ausgaben hinzugefügt)'}
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
          </>
        )}
      </div>
    </div>
  )
}

export default BudgetSummary
