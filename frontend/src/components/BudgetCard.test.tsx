import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BudgetCard from './BudgetCard'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => `${key}${values?.name ? ` ${values.name}` : ''}${values?.year ? ` ${values.year}` : ''}`, i18n: { language: 'en-US' } }) }))
vi.mock('../services/api', () => ({ budgetApi: { getSummary: vi.fn() } }))

describe('budget card', () => {
  it('shows a negative signed balance for the named year with independent accessible actions', () => {
    const budget = { id: 1, name: 'Household', currency: 'CHF', created_at: '2025-01-01', updated_at: '2025-01-01' }
    const client = new QueryClient()
    client.setQueryData(['budget', 1, 'summary'], { budget, categories: [{ id: 1, budget: 1, name: 'Rent', category_type: 'FIXED_EXPENSE', is_active: true, input_mode: 'MONTHLY' }], entries: [{ id: 1, category: 1, year: 2025, month: 1, planned_amount: '100', actual_amount: null }], tax_entries: [], salary_reductions: [], actual_balances: [] })
    const onDelete = vi.fn()
    const onExport = vi.fn()
    render(<QueryClientProvider client={client}><MemoryRouter><BudgetCard budget={budget} onDelete={onDelete} onExport={onExport} isDeleting={false} /></MemoryRouter></QueryClientProvider>)
    expect(screen.getByText('-100.00 CHF')).toBeVisible()
    expect(screen.getByText('dashboardUX.plannedBalance 2025')).toBeVisible()
    const exportButton = screen.getByRole('button', { name: 'dashboardUX.exportNamed Household' })
    const deleteButton = screen.getByRole('button', { name: 'dashboardUX.deleteNamed Household' })
    expect(exportButton.closest('a')).toBeNull()
    expect(deleteButton.closest('a')).toBeNull()
    fireEvent.click(exportButton)
    fireEvent.click(deleteButton)
    expect(onExport).toHaveBeenCalledWith(1)
    expect(onDelete).toHaveBeenCalledWith(1, 'Household')
  })
})
