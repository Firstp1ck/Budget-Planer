import { describe, expect, it } from 'vitest'
import type { BudgetCategory, BudgetEntry, BudgetSummaryData } from '../types/budget'
import { getDashboardBalance } from './dashboardBalance'

const category = (overrides: Partial<BudgetCategory> = {}): BudgetCategory => ({ id: 1, budget: 1, name: 'Salary', category_type: 'INCOME', order: 0, is_active: true, input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null, ...overrides })
const entry = (overrides: Partial<BudgetEntry> = {}): BudgetEntry => ({ id: 1, category: 1, month: 1, year: 2025, planned_amount: '100', actual_amount: '999', notes: '', status: 'WITHIN_BUDGET', ...overrides })
const summary = (overrides: Partial<BudgetSummaryData> = {}): BudgetSummaryData => ({ budget: { id: 1, name: 'Budget', currency: 'CHF', created_at: '', updated_at: '' }, categories: [category()], entries: [entry()], tax_entries: [], salary_reductions: [], actual_balances: [], ...overrides })

describe('dashboard planned balance', () => {
  it('uses the latest data year and planned salary, ignoring actuals and older years', () => {
    const result = getDashboardBalance(summary({ categories: [category(), category({ id: 2, name: 'Rent', category_type: 'FIXED_EXPENSE' })], entries: [entry({ year: 2024, planned_amount: '9000' }), entry(), entry({ id: 2, category: 2, planned_amount: '250', actual_amount: '0' })] }))
    expect(result).toEqual({ year: 2025, balance: -150 })
  })
  it.each(['Salary', 'Gehalt', 'categorySuggestions.salary'])('recognizes %s and applies planned deductions and taxes', name => {
    const result = getDashboardBalance(summary({ categories: [category({ name })], salary_reductions: [{ id: 1, budget: 1, name: 'deduction', reduction_type: 'PERCENTAGE', reduction_type_display: '', value: '10', order: 0, is_active: true }], tax_entries: [{ id: 1, budget: 1, name: 'tax', percentage: '5', order: 0, is_active: true }] }))
    expect(result.balance).toBe(85)
  })
  it('uses annual and custom mode amounts instead of historical entry plans', () => {
    const result = getDashboardBalance(summary({ categories: [category({ input_mode: 'YEARLY', yearly_amount: '1200' }), category({ id: 2, name: 'Rent', category_type: 'FIXED_EXPENSE', input_mode: 'CUSTOM', custom_months: 4, custom_start_month: 11, yearly_amount: '400' })] }))
    expect(result.balance).toBe(-400)
  })
  it('ignores inactive categories and uses the current year when empty', () => {
    expect(getDashboardBalance(summary({ categories: [category({ is_active: false })], entries: [] }), 2026)).toEqual({ year: 2026, balance: 0 })
  })
  it('includes years with actual balances but no entries', () => {
    const result = getDashboardBalance(summary({ actual_balances: [{ id: 1, budget: 1, month: 1, year: 2027, actual_income: '0', actual_expenses: '0', balance: '0', created_at: '', updated_at: '' }] }))
    expect(result).toEqual({ year: 2027, balance: 0 })
  })
})
