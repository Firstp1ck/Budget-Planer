import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MonthlyCell from './MonthlyCell'
import ActualBalanceCell from './ActualBalanceCell'
import CategoryRow from './CategoryRow'
import { actualBalanceApi, categoryApi, entryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry, MonthlyActualBalance } from '../types/budget'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../services/api', () => ({ entryApi: { create: vi.fn(), update: vi.fn() }, actualBalanceApi: { setField: vi.fn() }, categoryApi: { planEntries: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() } }))

const category: BudgetCategory = { id: 4, budget: 1, name: 'Rent', category_type: 'FIXED_EXPENSE', order: 0, is_active: true, input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null }
const entry: BudgetEntry = { id: 9, category: 4, month: 2, year: 2024, planned_amount: '100.00', actual_amount: '0.00', notes: 'Keep this', status: 'WITHIN_BUDGET' }
const cellProps = { categoryId: 4, month: 2, budgetId: 1, budgetYear: 2024, displayCurrency: 'CHF' as const, category, calculatedMonthlyAmount: 0, onEditSettings: vi.fn() }
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const rowWrapper = (queryClient: QueryClient, children: React.ReactNode) => <QueryClientProvider client={queryClient}><table><tbody><tr>{children}</tr></tbody></table></QueryClientProvider>

beforeEach(() => { vi.clearAllMocks() })

describe('monthly grid entry', () => {
  it('opens with keyboard, saves selected historical year, and keeps explicit actual zero', async () => {
    const user = userEvent.setup()
    vi.mocked(entryApi.update).mockResolvedValue({ data: entry } as never)
    render(rowWrapper(client(), <MonthlyCell {...cellProps} entry={entry} />))
    screen.getByRole('button', { name: 'gridUX.editAmount' }).focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('spinbutton', { name: 'entry.planned (CHF)' })
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, '125{Enter}')
    await waitFor(() => expect(entryApi.update).toHaveBeenCalledWith(9, { category: 4, month: 2, year: 2024, planned_amount: '125.00', actual_amount: '0.00' }))
    expect(entryApi.create).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'gridUX.editAmount' })).toHaveTextContent('0.00 CHF')
  })

  it('reads refreshed props when reopened and preserves a failed draft for retry', async () => {
    const user = userEvent.setup()
    const queryClient = client()
    const view = render(rowWrapper(queryClient, <MonthlyCell {...cellProps} entry={entry} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editAmount' }))
    await user.keyboard('{Escape}')
    view.rerender(rowWrapper(queryClient, <MonthlyCell {...cellProps} entry={{ ...entry, planned_amount: '250.00' }} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editAmount' }))
    const input = screen.getByRole('spinbutton', { name: 'entry.planned (CHF)' })
    expect(input).toHaveValue(250)
    vi.mocked(entryApi.update).mockRejectedValueOnce(new Error('offline'))
    await user.clear(input)
    await user.type(input, '275')
    await user.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('gridUX.saveError')
    expect(input).toHaveValue(275)
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled()
  })

  it.each(['INCOME', 'FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'SAVINGS'] as const)('records actual amounts for monthly %s categories and distinguishes blank from zero', async categoryType => {
    const user = userEvent.setup()
    vi.mocked(entryApi.update).mockResolvedValue({ data: entry } as never)
    const queryClient = client()
    const props = { ...cellProps, category: { ...category, category_type: categoryType } }
    render(rowWrapper(queryClient, <MonthlyCell {...props} entry={entry} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editAmount' }))
    const actualInput = screen.getByRole('spinbutton', { name: 'entry.actual (CHF)' })
    expect(actualInput).toHaveValue(0)
    await user.clear(actualInput)
    await user.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(entryApi.update).toHaveBeenCalledWith(9, expect.objectContaining({ planned_amount: '100.00', actual_amount: null })))
  })

  it('uses same-year suggestions and never takes December as January previous month', async () => {
    const user = userEvent.setup()
    const queryClient = client()
    queryClient.setQueryData(['budget', 1, 'summary'], { entries: [{ ...entry, month: 1, year: 2023 }, { ...entry, month: 12, year: 2024 }] })
    render(rowWrapper(queryClient, <MonthlyCell {...cellProps} month={1} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editAmount' }))
    expect(screen.queryByRole('button', { name: /entry.previousMonth/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /entry.average/ })).not.toBeInTheDocument()
  })

  it('routes calculated custom amounts to settings without writing entries or category config', async () => {
    const user = userEvent.setup()
    render(rowWrapper(client(), <MonthlyCell {...cellProps} month={1} category={{ ...category, input_mode: 'CUSTOM', custom_months: 4, custom_start_month: 1, yearly_amount: '200.00' }} calculatedMonthlyAmount={200} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editGlobalSettings' }))
    expect(cellProps.onEditSettings).toHaveBeenCalledOnce()
    expect(entryApi.create).not.toHaveBeenCalled()
    expect(categoryApi.update).not.toHaveBeenCalled()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})

describe('actual balances', () => {
  const balance: MonthlyActualBalance = { id: 2, budget: 1, month: 2, year: 2024, actual_income: '250.00', actual_expenses: '125.00', balance: '125.00', created_at: '', updated_at: '' }
  it('patches only the selected field, then reopens with refreshed values', async () => {
    const user = userEvent.setup()
    vi.mocked(actualBalanceApi.setField).mockResolvedValue({ data: balance } as never)
    const queryClient = client()
    const props = { budgetId: 1, budgetYear: 2024, month: 2, displayCurrency: 'CHF' as const, field: 'income' as const }
    const view = render(rowWrapper(queryClient, <ActualBalanceCell {...props} balance={balance} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editBalance' }))
    let input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '0{Enter}')
    await waitFor(() => expect(actualBalanceApi.setField).toHaveBeenCalledWith({ budget: 1, year: 2024, month: 2, field: 'income', value: '0.00' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'gridUX.editBalance' })).toBeInTheDocument())
    view.rerender(rowWrapper(queryClient, <ActualBalanceCell {...props} balance={{ ...balance, actual_income: '450.00' }} />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editBalance' }))
    input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(450)
    vi.mocked(actualBalanceApi.setField).mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('gridUX.saveError')
    expect(input).toHaveValue(450)
  })

  it('blocks repeat Enter while saving', async () => {
    const user = userEvent.setup()
    vi.mocked(actualBalanceApi.setField).mockImplementation(() => new Promise(() => {}))
    render(rowWrapper(client(), <ActualBalanceCell month={2} budgetId={1} budgetYear={2024} displayCurrency="CHF" field="expenses" />))
    await user.click(screen.getByRole('button', { name: 'gridUX.editBalance' }))
    const form = screen.getByRole('form', { name: 'gridUX.editBalance' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(actualBalanceApi.setField).toHaveBeenCalledOnce())
  })
})

const categoryTable = (queryClient: QueryClient, displayMonths: number[] = [2], cats = [category]) => <QueryClientProvider client={queryClient}><table><tbody><CategoryRow type="FIXED_EXPENSE" categories={cats} entries={[{ ...entry, month: 1, year: 2024, planned_amount: '125.00' }, { ...entry, id: 10, month: 1, year: 2023, planned_amount: '900.00' }, entry]} displayMonths={displayMonths} getEntryForCategoryAndMonth={() => entry} budgetId={1} budgetYear={2024} displayCurrency="CHF" /></tbody></table></QueryClientProvider>

describe('category plan actions', () => {
  it('copies selected-year plan through atomic API without actuals or notes', async () => {
    const user = userEvent.setup()
    vi.mocked(categoryApi.planEntries).mockResolvedValue({ data: [entry] } as never)
    render(categoryTable(client()))
    await user.click(screen.getByRole('button', { name: 'entry.copyPreviousMonth: Rent' }))
    await waitFor(() => expect(categoryApi.planEntries).toHaveBeenCalledWith(4, { year: 2024, entries: [{ month: 2, planned_amount: '125.00' }] }))
    expect(entryApi.update).not.toHaveBeenCalled()
  })

  it('requires all-year confirmation for global settings without rewriting history', async () => {
    const user = userEvent.setup()
    vi.mocked(categoryApi.update).mockResolvedValue({ data: category } as never)
    render(categoryTable(client()))
    await user.click(screen.getByRole('button', { name: 'inputMode.changeInputMode: Rent' }))
    await user.click(screen.getByRole('button', { name: /common.save/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('gridUX.confirmRequired')
    expect(categoryApi.update).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: 'gridUX.confirmGlobal' }))
    await user.click(screen.getByRole('button', { name: /common.save/ }))
    await waitFor(() => expect(categoryApi.update).toHaveBeenCalledWith(4, { input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null }))
    expect(categoryApi.planEntries).not.toHaveBeenCalled()
    expect(entryApi.update).not.toHaveBeenCalled()
  })

  it('autofills only empty months through one atomic selected-year request', async () => {
    const user = userEvent.setup()
    vi.mocked(categoryApi.planEntries).mockResolvedValue({ data: [] } as never)
    render(categoryTable(client(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
    await user.click(screen.getByRole('button', { name: 'autofill.autofillAll: Rent' }))
    const input = screen.getByRole('spinbutton', { name: 'autofill.amountPerMonth (CHF):' })
    await user.clear(input)
    await user.type(input, '150')
    await user.click(screen.getByRole('button', { name: /autofill.fill$/ }))
    await waitFor(() => expect(categoryApi.planEntries).toHaveBeenCalledOnce())
    expect(vi.mocked(categoryApi.planEntries).mock.calls[0]).toEqual([4, { year: 2024, entries: Array.from({ length: 10 }, (_, i) => ({ month: i + 3, planned_amount: '150.00' })) }])
  })
})
