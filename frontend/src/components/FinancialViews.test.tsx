import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BudgetGraphs from './BudgetGraphs'
import BudgetSummary from './BudgetSummary'
import BalanceDifferenceCard from './BalanceDifferenceCard'
import type { BudgetCategory, BudgetEntry, SalaryReduction, TaxEntry } from '../types/budget'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../utils/currency', () => ({ formatCurrency: (amount: number) => `${amount.toFixed(2)} CHF` }))
vi.mock('recharts', () => ({
  LineChart: ({ data }: { data: unknown }) => <pre data-testid="line-data">{JSON.stringify(data)}</pre>,
  BarChart: () => null, PieChart: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Line: () => null, Bar: () => null, Pie: () => null, Cell: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
}))

const salary: BudgetCategory = { id: 1, budget: 1, name: 'Salary', category_type: 'INCOME', input_mode: 'MONTHLY', order: 0, is_active: true, custom_months: null, custom_start_month: null, yearly_amount: null }
const entry: BudgetEntry = { id: 1, category: 1, month: 1, year: 2023, planned_amount: '5000.00', actual_amount: '6000.00', notes: '', status: 'WITHIN_BUDGET' }
const deduction: SalaryReduction = { id: 1, budget: 1, name: 'Pension', reduction_type: 'PERCENTAGE', reduction_type_display: 'Percentage', value: '10.00', order: 0, is_active: true }
const tax: TaxEntry = { id: 1, budget: 1, name: 'Tax', percentage: '10.00', order: 0, is_active: true }

describe('financial view consistency', () => {
  it('keeps planned chart taxes and net income independent from actual salary', () => {
    render(<BudgetGraphs categories={[salary]} entries={[entry]} taxEntries={[tax]} salaryReductions={[deduction]} actualBalances={[]} displayCurrency="CHF" budgetYear={2023} />)
    const firstChart = JSON.parse(screen.getAllByTestId('line-data')[0].textContent || '[]')
    expect(firstChart[0]).toMatchObject({ income: 5400, expenses: 600, balance: 4800, plannedIncome: 4500, plannedExpenses: 500, plannedBalance: 4000 })
  })

  it('shows the minus sign on a deficit and treats explicit actual zero as recorded income', () => {
    const expense = { ...salary, id: 2, name: 'Rent', category_type: 'FIXED_EXPENSE' as const }
    render(<BudgetSummary budgetId={1} categories={[salary, expense]} entries={[
      { ...entry, actual_amount: '0.00' },
      { ...entry, id: 2, category: 2, planned_amount: '150.00', actual_amount: null },
    ]} taxEntries={[]} salaryReductions={[deduction]} selectedMonth={1} displayCurrency="CHF" />)
    expect(screen.getByText('-150.00 CHF')).toBeInTheDocument()
    expect(screen.getByText('0.00 CHF')).toBeInTheDocument()
  })

  it('applies deductions only to the first supported salary income', () => {
    const secondSalary = { ...salary, id: 2, name: 'Lohn' }
    render(<BudgetSummary budgetId={1} categories={[salary, secondSalary]} entries={[
      { ...entry, actual_amount: null },
      { ...entry, id: 2, category: 2, planned_amount: '3000.00', actual_amount: null },
    ]} taxEntries={[]} salaryReductions={[deduction]} selectedMonth={1} displayCurrency="CHF" />)
    // 5000 salary - 500 pension + 3000 other income, rather than repeating the first salary.
    expect(screen.getByText('7500.00 CHF')).toBeInTheDocument()
    expect(screen.getByText('+7500.00 CHF')).toBeInTheDocument()
    expect(screen.queryByText('9000.00 CHF')).not.toBeInTheDocument()
  })

  it('uses that same salary source in the planned-versus-actual comparison', () => {
    render(<BalanceDifferenceCard categories={[salary, { ...salary, id: 2, name: 'Lohn' }]} entries={[
      { ...entry, actual_amount: null },
      { ...entry, id: 2, category: 2, planned_amount: '3000.00', actual_amount: null },
    ]} taxEntries={[]} salaryReductions={[deduction]} actualBalances={[]} selectedMonth={1} displayCurrency="CHF" budgetYear={2023} />)
    expect(screen.getByText('+7500.00 CHF')).toBeInTheDocument()
    expect(screen.queryByText('+9000.00 CHF')).not.toBeInTheDocument()
  })
})
