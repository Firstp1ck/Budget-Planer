import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import BudgetEditor, { getPlanningYears } from './BudgetEditor'

const mocks = vi.hoisted(() => ({ getSummary: vi.fn(), createTemplate: vi.fn() }))
vi.mock('../services/api', () => ({ budgetApi: { getSummary: mocks.getSummary }, templateApi: { getAll: async () => ({ data: { results: [] } }), createFromBudget: mocks.createTemplate } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }))
vi.mock('../utils/currency', () => ({
  getSelectedCurrency: () => 'CHF', setSelectedCurrency: vi.fn(),
  initializeExchangeRates: async () => ({ lastUpdated: '2020-01-01' }), fetchExchangeRates: vi.fn(),
  getExchangeRates: () => ({ CHF: 1, EUR: 1, USD: 1, lastUpdated: '2020-01-01' }),
  CURRENCY_NAMES: { CHF: 'Swiss franc', EUR: 'Euro', USD: 'US dollar' }, CURRENCY_SYMBOLS: { CHF: 'CHF', EUR: 'EUR', USD: 'USD' },
}))
vi.mock('../components/BudgetTable', () => ({ default: ({ budgetYear }: { budgetYear: number }) => <div data-testid="grid-year">{budgetYear}</div> }))
vi.mock('../components/BudgetSummary', () => ({ default: () => null }))
vi.mock('../components/BudgetGraphs', () => ({ default: () => null }))
vi.mock('../components/BalanceDifferenceCard', () => ({ default: () => null }))

const summary = (name: string, balanceYear: number) => ({ data: {
  budget: { id: 1, name, currency: 'CHF' }, categories: [], entries: [],
  tax_entries: [], salary_reductions: [], actual_balances: [{ year: balanceYear, month: 1, actual_income: '0.00', actual_expenses: '0.00' }],
} })

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/budget/1']}>
    <Link to="/budget/2">Another budget</Link>
    <Routes><Route path="/budget/:id" element={<BudgetEditor />} /></Routes>
  </MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  mocks.getSummary.mockReset()
  mocks.createTemplate.mockReset()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

describe('planning years', () => {
  it('includes balance-only historical years, current year and adjacent planning years', () => {
    expect(getPlanningYears([], [{ year: 2022 }], 2026, 2022)).toEqual([2026, 2023, 2022, 2021])
    expect(getPlanningYears([], [], 2026, null)).toEqual([2027, 2026, 2025])
  })
  it('keeps planning options within the supported entry year range', () => {
    expect(getPlanningYears([], [], 2100, 2100)).toEqual([2100, 2099])
  })
})

describe('budget editor recovery and navigation', () => {
  it('loads balance-only years and resets year and tab state when navigating to a different budget', async () => {
    mocks.getSummary.mockImplementation((id: number) => Promise.resolve(summary(`Budget ${id}`, id === 1 ? 2022 : 2024)))
    renderEditor()
    await waitFor(() => expect(screen.getByLabelText('editor.year')).toHaveValue('2022'))
    fireEvent.change(screen.getByLabelText('editor.year'), { target: { value: '2021' } })
    expect(screen.getByTestId('grid-year')).toHaveTextContent('2021')
    fireEvent.click(screen.getByRole('button', { name: /editor.graphs/ }))
    fireEvent.click(screen.getByRole('link', { name: 'Another budget' }))
    await waitFor(() => expect(screen.getByLabelText('editor.year')).toHaveValue('2024'))
    expect(screen.getByTestId('grid-year')).toHaveTextContent('2024')
  })

  it('offers retry on connection errors and then shows the saved budget', async () => {
    mocks.getSummary.mockRejectedValueOnce(new Error('network')).mockResolvedValue(summary('Recovered budget', 2023))
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'editorUX.loadError' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'editorUX.retry' }))
    expect(await screen.findByRole('heading', { name: 'Recovered budget' })).toBeInTheDocument()
  })

  it('distinguishes a missing budget from a connection error', async () => {
    mocks.getSummary.mockRejectedValue({ response: { status: 404 } })
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'budget.notFound' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'editorUX.retry' })).not.toBeInTheDocument()
  })

  it('opens a named template dialog and retains the draft on save failure', async () => {
    mocks.getSummary.mockResolvedValue(summary('Budget', 2023))
    mocks.createTemplate.mockRejectedValue(new Error('network'))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: /template.saveAsTemplate$/ }))
    expect(screen.getByRole('dialog', { name: 'template.saveAsTemplateTitle' })).toBeInTheDocument()
    const name = screen.getByLabelText('template.templateName:')
    fireEvent.change(name, { target: { value: 'My template' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    await waitFor(() => expect(mocks.createTemplate).toHaveBeenCalledWith(1, 'My template', undefined))
    await waitFor(() => expect(name).not.toBeDisabled())
    expect(name).toHaveValue('My template')
    expect(screen.getByRole('dialog', { name: 'template.saveAsTemplateTitle' })).toBeInTheDocument()
  })
})
