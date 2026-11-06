import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetDashboard from './BudgetDashboard'
import { budgetApi, categoryApi, templateApi } from '../services/api'

vi.mock('../services/api', () => ({ budgetApi: { getAll: vi.fn(), create: vi.fn(), import: vi.fn(), export: vi.fn(), delete: vi.fn() }, categoryApi: { create: vi.fn() }, templateApi: { getAll: vi.fn(), apply: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../components/BudgetCard', () => ({ default: ({ budget }: { budget: { name: string } }) => <article>{budget.name}</article> }))
const budget = { id: 7, name: 'Household', currency: 'CHF', created_at: '2025-01-01', updated_at: '2025-01-01' }
const page = (results: typeof budget[]) => ({ data: { count: results.length, next: null, previous: null, results } })
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter><BudgetDashboard /><Location /></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(budgetApi.getAll).mockResolvedValue(page([]) as never)
  vi.mocked(templateApi.getAll).mockResolvedValue(page([]) as never)
  vi.mocked(budgetApi.create).mockResolvedValue({ data: budget } as never)
  vi.mocked(categoryApi.create).mockResolvedValue({ data: {} } as never)
})
async function beginCreate() {
  await screen.findByText('dashboard.noBudgets')
  fireEvent.click(screen.getByRole('button', { name: '+ dashboard.createBudget' }))
  fireEvent.change(screen.getByLabelText('createBudget.nameLabel'), { target: { value: ' Household ' } })
}

describe('budget dashboard workflows', () => {
  it('opens a new starter budget, uses translated names and prevents repeat submissions', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(budgetApi.create).mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    mount()
    await beginCreate()
    const form = screen.getByRole('form', { name: 'createBudget.title' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(budgetApi.create).toHaveBeenCalledTimes(1))
    expect(budgetApi.create).toHaveBeenCalledWith({ name: 'Household', currency: 'CHF' })
    await act(async () => finish({ data: budget }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/budget/7'))
    expect(categoryApi.create).toHaveBeenCalledTimes(5)
    expect(categoryApi.create).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'dashboardUX.starter.salary' }))
  })
  it('keeps failed template setup explicit and never creates fallback starter categories', async () => {
    vi.mocked(templateApi.getAll).mockResolvedValue({ data: { results: [{ id: 2, name: 'Template', categories: [] }] } } as never)
    vi.mocked(templateApi.apply).mockRejectedValue(new Error('connection lost'))
    mount()
    await beginCreate()
    await screen.findByRole('option', { name: /Template/ })
    fireEvent.change(screen.getByLabelText('dashboardUX.setupLabel'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))
    expect(await screen.findByText('dashboardUX.setupFailed')).toBeVisible()
    expect(categoryApi.create).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'dashboardUX.openCreated' })).toHaveAttribute('href', '/budget/7')
  })
  it('opens a genuinely empty budget without creating categories', async () => {
    mount()
    await beginCreate()
    fireEvent.change(screen.getByLabelText('dashboardUX.setupLabel'), { target: { value: 'empty' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/budget/7'))
    expect(categoryApi.create).not.toHaveBeenCalled()
    expect(templateApi.apply).not.toHaveBeenCalled()
  })
  it('retains the name and setup after failed creation and explains duplicate recovery', async () => {
    vi.mocked(budgetApi.create).mockRejectedValue(new Error('timeout'))
    mount()
    await beginCreate()
    fireEvent.change(screen.getByLabelText('dashboardUX.setupLabel'), { target: { value: 'empty' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))
    expect(await screen.findByText('dashboardUX.createFailed')).toBeVisible()
    expect(screen.getByLabelText('createBudget.nameLabel')).toHaveValue(' Household ')
    expect(screen.getByLabelText('dashboardUX.setupLabel')).toHaveValue('empty')
  })
  it('filters cached budgets and distinguishes no search results from an empty account', async () => {
    vi.mocked(budgetApi.getAll).mockResolvedValue(page([budget]) as never)
    mount()
    expect(await screen.findByText('Household')).toBeVisible()
    fireEvent.change(screen.getByLabelText('dashboardUX.search'), { target: { value: 'missing' } })
    expect(screen.getByText('dashboardUX.noResults')).toBeVisible()
    expect(screen.queryByText('dashboard.noBudgets')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'dashboardUX.clearSearch' }))
    expect(screen.getByText('Household')).toBeVisible()
  })
  it('shows an uncertain import outcome without guessing success from budget names', async () => {
    vi.mocked(budgetApi.import).mockRejectedValue(new Error('timeout'))
    mount()
    await screen.findByText('dashboard.noBudgets')
    const data = { budget, categories: [], entries: [], salary_reductions: [], tax_entries: [], actual_balances: [] }
    const file = new File([JSON.stringify(data)], 'budget.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(data)) })
    fireEvent.change(screen.getByLabelText('dashboard.importBudget', { selector: 'input' }), { target: { files: [file] } })
    expect(await screen.findByText('dashboardUX.importUncertain')).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
  it('prevents parallel imports and reports pending work', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(budgetApi.import).mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    mount()
    await screen.findByText('dashboard.noBudgets')
    const data = { budget, categories: [], entries: [] }
    const file = new File([], 'budget.json')
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(data)) })
    const input = screen.getByLabelText('dashboard.importBudget', { selector: 'input' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(budgetApi.import).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'dashboardUX.importing' })).toBeDisabled()
    await act(async () => finish({ data: budget }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/budget/7'))
  })
})
