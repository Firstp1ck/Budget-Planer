import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { budgetApi } from '../services/api'
import type { Budget, TaxEntry } from '../types/budget'
import { formatCurrency, Currency } from '../utils/currency'

interface BudgetCardProps {
  budget: Budget
  onDelete: (id: number, name: string) => void
  onExport: (id: number) => void
  isDeleting: boolean
}

function BudgetCard({ budget, onDelete, onExport, isDeleting }: BudgetCardProps) {
  const displayCurrency: Currency = budget.currency as Currency || 'CHF'

  // Fetch summary data to calculate yearly SOLL balance
  const { data: summaryData } = useQuery({
    queryKey: ['budget', budget.id, 'summary'],
    queryFn: async () => {
      const response = await budgetApi.getSummary(budget.id)
      return response.data
    },
  })

  // Calculate yearly SOLL balance (similar to BudgetSummary logic)
  const calculateYearlyBalance = (): number | null => {
    if (!summaryData) return null

    const { categories, entries, tax_entries, salary_reductions } = summaryData

    // Get gross salary for a specific month
    const getGrossSalaryForMonth = (month: number): number => {
      const salaryCategory = categories.find(
        (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
      )
      if (!salaryCategory) return 0

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

      return salary_reductions.reduce((sum, reduction) => {
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

    // Calculate total taxes for the year
    let totalTaxes = 0
    for (let month = 1; month <= 12; month++) {
      tax_entries.forEach((tax) => {
        if (tax.is_active) {
          totalTaxes += calculateTaxAmount(tax, month)
        }
      })
    }

    // Calculate total income and expenses for the year
    let totalIncome = 0
    let totalExpenses = 0

    categories.forEach((category) => {
      let categoryTotal = 0

      // For salary category, use net salary
      if (category.category_type === 'INCOME' && category.name.toLowerCase().includes('gehalt')) {
        let salarySum = 0
        for (let month = 1; month <= 12; month++) {
          salarySum += getNetSalaryForMonth(month)
        }
        categoryTotal = salarySum
      } else {
        // For other categories, calculate normally
        if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
          const yearlyAmount = parseFloat(category.yearly_amount || '0')

          if (category.input_mode === 'YEARLY') {
            categoryTotal = yearlyAmount
          } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
            categoryTotal = yearlyAmount * category.custom_months
          }
        } else {
          // For MONTHLY mode, sum planned entries
          const categoryEntries = entries.filter((e) => e.category === category.id)
          categoryTotal = categoryEntries.reduce((sum, entry) => {
            return sum + parseFloat(entry.planned_amount)
          }, 0)
        }
      }

      // Add to appropriate total
      if (category.category_type === 'INCOME') {
        totalIncome += categoryTotal
      } else {
        totalExpenses += categoryTotal
      }
    })

    // Add taxes to expenses (using net mode as default)
    totalExpenses += totalTaxes

    return totalIncome - totalExpenses
  }

  const yearlyBalance = calculateYearlyBalance()

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the delete or export button
    if ((e.target as HTMLElement).closest('button[data-delete-button]') ||
        (e.target as HTMLElement).closest('button[data-export-button]')) {
      return
    }
    // Navigation is handled by the Link wrapper
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(budget.id, budget.name)
  }

  const handleExportClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onExport(budget.id)
  }

  return (
    <Link
      to={`/budget/${budget.id}`}
      className="block"
      onClick={handleCardClick}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700 overflow-hidden group transform hover:-translate-y-1 cursor-pointer">
        <div className="p-7">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {budget.name}
              </h3>
              <div className="flex items-center gap-3 text-sm">
                <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                  {budget.currency}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-5 pb-5 border-b border-gray-200 dark:border-gray-700">
            {yearlyBalance !== null && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Jährliche SOLL Bilanz
                </p>
                <p className={`text-2xl font-bold ${
                  yearlyBalance >= 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-orange-600 dark:text-orange-400'
                }`}>
                  {yearlyBalance >= 0 ? '+' : ''}{formatCurrency(Math.abs(yearlyBalance), displayCurrency)}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm flex items-center justify-center">
              Öffnen
            </div>
            <button
              data-export-button
              onClick={handleExportClick}
              className="px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-all font-medium shadow-sm border border-green-200 dark:border-green-800 text-sm"
              title="Budget exportieren"
            >
              📤
            </button>
            <button
              data-delete-button
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-all font-medium disabled:opacity-50 shadow-sm border border-red-200 dark:border-red-800 text-sm"
              title="Budget löschen"
            >
              🗑️
            </button>
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs italic text-gray-500 dark:text-gray-400">
              Erstellt am {new Date(budget.created_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </p>
            <p className="text-xs italic text-gray-500 dark:text-gray-400">
              Aktualisiert am {new Date(budget.updated_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default BudgetCard
