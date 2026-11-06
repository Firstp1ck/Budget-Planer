import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import BudgetTable from './BudgetTable'
import i18n from '../i18n'
import type { BudgetCategory, BudgetEntry } from '../types/budget'

vi.mock('../services/api', () => ({ entryApi: {}, actualBalanceApi: {}, categoryApi: {}, salaryReductionApi: {}, taxApi: {} }))

it('keeps the full annual table available while editing in a separate dialog', async () => {
  await i18n.changeLanguage('de-DE')
  const user = userEvent.setup()
  const base = { budget: 1, order: 0, is_active: true, input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null } as const
  const categories: BudgetCategory[] = [
    { ...base, id: 1, name: 'Salary', category_type: 'INCOME' },
    { ...base, id: 2, name: 'Krankenversicherung und weitere regelmässige Versicherungsbeiträge', category_type: 'FIXED_EXPENSE' },
    { ...base, id: 3, name: 'Sparen', category_type: 'SAVINGS', input_mode: 'CUSTOM', custom_months: 4, custom_start_month: 2, yearly_amount: '123456.78' },
  ]
  const entries: BudgetEntry[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, category: 1, month: i + 1, year: 2024, planned_amount: '99999999.99', actual_amount: '12345678.90', notes: '', status: 'WITHIN_BUDGET' }))
  const client = new QueryClient()
  client.setQueryData(['budget', 1, 'summary'], { entries })
  render(<QueryClientProvider client={client}><div data-layout-sample>
    <BudgetTable budgetId={1} budgetYear={2024} categories={categories} entries={entries} taxEntries={[{ id: 1, budget: 1, name: 'Gemeindesteuer', percentage: '12.00', is_active: true, order: 0 }]} salaryReductions={[{ id: 1, budget: 1, name: 'Pensionskasse', reduction_type: 'PERCENTAGE', reduction_type_display: 'Prozent', value: '5.00', is_active: true, order: 0 }]} selectedMonth={null} displayCurrency="CHF" />
  </div></QueryClientProvider>)
  expect(screen.getAllByRole('columnheader')).toHaveLength(16)
  const trigger = screen.getByRole('button', { name: i18n.t('gridUX.editAmount', { category: 'Salary', month: 1, year: 2024 }) })
  await user.click(trigger)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText(`${i18n.t('entry.planned')} (CHF)`)).toHaveFocus()
  expect(screen.getAllByRole('columnheader')).toHaveLength(16)

  // Optional fixture for checking actual CSS geometry in a headless browser.
  if (process.env.BUDGET_LAYOUT_FIXTURE) {
    const assets = resolve('dist/assets')
    const cssFile = readdirSync(assets).find(name => name.endsWith('.css'))!
    const css = readFileSync(resolve(assets, cssFile), 'utf8')
    writeFileSync(process.env.BUDGET_LAYOUT_FIXTURE, `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body>${document.body.innerHTML}<pre id="layout-result"></pre><script>
      const sample = document.querySelector('[data-layout-sample]');
      const grid = sample.querySelector('.budget-grid');
      const table = grid.querySelector('table');
      const results = [];
      const editor = sample.querySelector('dialog');
      editor.removeAttribute('open');
      for (const width of [320, 768, 1024, 1280, 1585, 1920]) {
        sample.style.width = width + 'px';
        const edge = sample.getBoundingClientRect().right;
        const overflowing = [...sample.querySelectorAll('*')].filter(element => !element.closest('dialog') && element.getBoundingClientRect().right > edge + 1);
        results.push({ width, gridWidth: grid.clientWidth, tableWidth: table.getBoundingClientRect().width, scrollWidth: grid.scrollWidth, overflowing: overflowing.map(element => element.tagName + '.' + element.className).slice(0, 8) });
      }
      const before = table.getBoundingClientRect().width;
      editor.showModal();
      const after = table.getBoundingClientRect().width;
      document.getElementById('layout-result').textContent = JSON.stringify({ results, editorChangesTableWidth: before !== after });
    </script></body></html>`, 'utf8')
  }

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('gridUX.editAmount', { category: 'Salary', month: 1, year: 2024 }) })).toHaveFocus())
  await user.click(screen.getByRole('button', { name: `${i18n.t('inputMode.changeInputMode')}: ${categories[2].name}` }))
  expect(within(screen.getByRole('dialog')).getByLabelText(`${i18n.t('inputMode.inputMode')}:`)).toHaveValue('CUSTOM')
})
