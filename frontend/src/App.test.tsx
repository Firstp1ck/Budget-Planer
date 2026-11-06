import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import i18n from './i18n'

vi.mock('./contexts/DarkModeContext', () => ({ DarkModeProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./components/Layout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('./components/LoadingScreen', () => ({ default: ({ onReady }: { onReady: () => void }) => <button onClick={onReady}>Backend ready</button> }))
vi.mock('./pages/BudgetDashboard', () => ({ default: () => <h1>Your budgets</h1> }))
vi.mock('./pages/BudgetEditor', () => ({ default: () => <h1>Budget editor</h1> }))
vi.mock('./utils/currency', () => ({ initializeExchangeRates: async () => ({}) }))

beforeEach(async () => { await i18n.changeLanguage('en-US') })

function startAt(path: string) {
  window.history.replaceState(null, '', path)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Backend ready' }))
}

describe('application entry routes', () => {
  it.each(['/', '/index.html'])('opens the dashboard from %s after startup', async path => {
    startAt(path)
    expect(await screen.findByRole('heading', { name: 'Your budgets' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument()
  })

  it('retains budget deep links', () => {
    startAt('/budget/7')
    expect(screen.getByRole('heading', { name: 'Budget editor' })).toBeInTheDocument()
  })

  it('keeps the recovery page for genuinely unknown routes', () => {
    startAt('/missing-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/')
  })
})
