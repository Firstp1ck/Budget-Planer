import type { BudgetCategory, BudgetSummaryData } from '../types/budget'
import { isSalaryCategory } from './salary'

/** Dashboard figures describe one named year and use planned values throughout. */
export function getDashboardBalance(summary: BudgetSummaryData, currentYear = new Date().getFullYear()) {
  const years = [...summary.entries, ...(summary.actual_balances || [])].map(item => item.year)
  const year = years.length ? Math.max(...years) : currentYear
  const entries = summary.entries.filter(entry => entry.year === year)
  const categories = summary.categories.filter(category => category.is_active)
  const amount = (category: BudgetCategory, month: number): number => {
    if (category.input_mode === 'YEARLY') return Number(category.yearly_amount || 0) / 12
    if (category.input_mode === 'CUSTOM') {
      const count = category.custom_months || 0
      const start = category.custom_start_month || 1
      const paymentMonths = Array.from({ length: count }, (_, index) => ((Math.round(start + index * 12 / count) - 1) % 12) + 1)
      return paymentMonths.includes(month) ? Number(category.yearly_amount || 0) : 0
    }
    return Number(entries.find(entry => entry.category === category.id && entry.month === month)?.planned_amount || 0)
  }
  const salary = categories.find(isSalaryCategory)
  let balance = 0
  for (let month = 1; month <= 12; month++) {
    const grossSalary = salary ? amount(salary, month) : 0
    const reductions = grossSalary === 0 ? 0 : summary.salary_reductions.reduce((sum, item) => {
      if (!item.is_active) return sum
      return sum + (item.reduction_type === 'PERCENTAGE' ? grossSalary * Number(item.value) / 100 : Number(item.value))
    }, 0)
    for (const category of categories) {
      const value = category.id === salary?.id ? Math.max(0, grossSalary - reductions) : amount(category, month)
      balance += category.category_type === 'INCOME' ? value : -value
    }
    balance -= summary.tax_entries.reduce((sum, tax) => sum + (tax.is_active ? grossSalary * Number(tax.percentage) / 100 : 0), 0)
  }
  return { year, balance }
}
