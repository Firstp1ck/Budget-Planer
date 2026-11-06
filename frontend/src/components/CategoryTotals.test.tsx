import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import CategoryRow from './CategoryRow'
import type { BudgetCategory, BudgetEntry, SalaryReduction } from '../types/budget'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

it('deducts only the selected salary source and keeps annual group totals consistent', () => {
  const base = { budget: 1, order: 0, is_active: true, input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null } as const
  const categories: BudgetCategory[] = [{ ...base, id: 1, name: 'Salary', category_type: 'INCOME' }, { ...base, id: 2, name: 'Lohn', category_type: 'INCOME' }]
  const entries: BudgetEntry[] = categories.map(category => ({ id: category.id, category: category.id, year: 2024, month: 1, planned_amount: category.id === 1 ? '1000.00' : '2000.00', actual_amount: null, notes: '', status: 'WITHIN_BUDGET' }))
  const reductions: SalaryReduction[] = [{ id: 1, budget: 1, name: 'Deduction', reduction_type: 'PERCENTAGE', reduction_type_display: 'Percentage', value: '10.00', order: 0, is_active: true }]
  render(<QueryClientProvider client={new QueryClient()}><table><tbody>
    <CategoryRow type="INCOME" categories={categories} entries={entries} displayMonths={[1]} getEntryForCategoryAndMonth={(id, month) => entries.find(entry => entry.category === id && entry.month === month)} budgetId={1} budgetYear={2024} displayCurrency="CHF" salaryReductions={reductions} isCollapsed />
  </tbody></table></QueryClientProvider>)
  expect(screen.getByText('2900.00 CHF')).toBeInTheDocument()
})
