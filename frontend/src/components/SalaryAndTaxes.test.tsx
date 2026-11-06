import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaxesSection from './TaxesSection'
import SalaryReductionsSection from './SalaryReductionsSection'
import type { BudgetCategory, BudgetEntry } from '../types/budget'

const mocks = vi.hoisted(() => ({ createTax: vi.fn(), createReduction: vi.fn() }))
vi.mock('../services/api', () => ({ taxApi: { create: mocks.createTax }, salaryReductionApi: { create: mocks.createReduction } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../utils/currency', () => ({ formatCurrency: (amount: number) => `${amount.toFixed(2)} CHF` }))

const salary: BudgetCategory = { id: 1, budget: 1, name: 'Salary', category_type: 'INCOME', input_mode: 'MONTHLY', order: 0, is_active: true, custom_months: null, custom_start_month: null, yearly_amount: null }
const entry: BudgetEntry = { id: 1, category: 1, month: 1, year: 2023, planned_amount: '5000.00', actual_amount: null, notes: '', status: 'WITHIN_BUDGET' }

function wrapper(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><table><tbody>{component}</tbody></table></QueryClientProvider>)
}

beforeEach(() => {
  mocks.createTax.mockReset()
  mocks.createReduction.mockReset()
})

describe('tax entry', () => {
  it('uses English salary categories and calculated mode amounts consistently', () => {
    wrapper(<TaxesSection budgetId={1} taxEntries={[{ id: 1, budget: 1, name: 'Tax', percentage: '10.00', order: 0, is_active: true }]} categories={[{ ...salary, input_mode: 'YEARLY', yearly_amount: '60000.00' }]} entries={[{ ...entry, planned_amount: '999.00' }]} displayMonths={[1]} displayCurrency="CHF" budgetYear={2023} />)
    expect(screen.queryByText('tax.noSalaryCategory')).not.toBeInTheDocument()
    expect(screen.getAllByText('500.00 CHF').length).toBeGreaterThan(0)
  })

  it('does not tax preserved historical entries outside the configured payment schedule', () => {
    wrapper(<TaxesSection budgetId={1} taxEntries={[{ id: 1, budget: 1, name: 'Tax', percentage: '10.00', order: 0, is_active: true }]} categories={[{ ...salary, input_mode: 'CUSTOM', yearly_amount: '5000.00', custom_months: 4, custom_start_month: 2 }]} entries={[entry]} displayMonths={[1]} displayCurrency="CHF" budgetYear={2023} />)
    expect(screen.queryByText('500.00 CHF')).not.toBeInTheDocument()
    expect(screen.getAllByText('0.00 CHF').length).toBeGreaterThan(0)
  })

  it('rejects invalid percentages, retains a failed draft, and blocks duplicate pending saves', async () => {
    wrapper(<TaxesSection budgetId={1} taxEntries={[]} categories={[salary]} entries={[entry]} displayMonths={[1]} displayCurrency="CHF" budgetYear={2023} />)
    fireEvent.click(screen.getByRole('button', { name: /tax.addTax/ }))
    const name = screen.getByRole('textbox', { name: 'common.name' })
    const percentage = screen.getByRole('spinbutton', { name: 'editorUX.taxPercentage' })
    fireEvent.change(name, { target: { value: '  Income tax  ' } })
    fireEvent.change(percentage, { target: { value: '101' } })
    fireEvent.keyDown(percentage, { key: 'Enter' })
    expect(mocks.createTax).not.toHaveBeenCalled()

    mocks.createTax.mockRejectedValueOnce(new Error('offline'))
    fireEvent.change(percentage, { target: { value: '10' } })
    fireEvent.keyDown(percentage, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(name).toHaveValue('  Income tax  ')
    expect(percentage).toHaveValue(10)
    expect(mocks.createTax).toHaveBeenCalledWith(expect.objectContaining({ name: 'Income tax', percentage: '10.00', budget: 1 }))

    mocks.createTax.mockImplementation(() => new Promise(() => {}))
    fireEvent.keyDown(percentage, { key: 'Enter' })
    await waitFor(() => expect(percentage).toBeDisabled())
    fireEvent.keyDown(percentage, { key: 'Enter' })
    expect(mocks.createTax).toHaveBeenCalledTimes(2)
  })
})

describe('salary deductions', () => {
  it('labels fixed amounts as CHF and preserves the form after a failed save', async () => {
    mocks.createReduction.mockRejectedValue(new Error('offline'))
    wrapper(<SalaryReductionsSection budgetId={1} salaryReductions={[]} categories={[salary]} entries={[entry]} displayMonths={[1]} displayCurrency="CHF" budgetYear={2023} />)
    fireEvent.click(screen.getByRole('button', { name: /salaryReduction.addReduction/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'common.name' }), { target: { value: ' Pension ' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'editorUX.deductionType' }), { target: { value: 'FIXED' } })
    const amount = screen.getByRole('spinbutton', { name: 'editorUX.deductionCHF' })
    fireEvent.change(amount, { target: { value: '-10' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    expect(mocks.createReduction).not.toHaveBeenCalled()
    fireEvent.change(amount, { target: { value: '150.5' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(amount).toHaveValue(150.5)
    expect(mocks.createReduction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pension', reduction_type: 'FIXED', value: '150.50' }))
  })
})
