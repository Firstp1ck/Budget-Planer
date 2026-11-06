import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoadingScreen from './LoadingScreen'
import { budgetApi } from '../services/api'

const { translate } = vi.hoisted(() => ({ translate: (key: string) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))
vi.mock('../contexts/DarkModeContext', () => ({ useDarkMode: () => ({ isDark: false }) }))
vi.mock('../services/api', () => ({ budgetApi: { health: vi.fn() } }))

afterEach(() => { vi.useRealTimers(); vi.mocked(budgetApi.health).mockReset() })

describe('startup recovery', () => {
  it('gives Retry a fresh deadline after the first attempt times out', async () => {
    vi.useFakeTimers()
    vi.mocked(budgetApi.health).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({} as never)
    const ready = vi.fn()
    render(<LoadingScreen onReady={ready} maxWaitTimeMs={1000} retryDelayMs={500} />)
    await act(() => vi.advanceTimersByTimeAsync(1100))
    expect(screen.getByText('loading.timeout')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    fireEvent.click(screen.getByRole('button', { name: 'loading.retry' }))
    await act(() => vi.advanceTimersByTimeAsync(850))
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('cancels obsolete StrictMode checks and does not call readiness after unmount', async () => {
    vi.useFakeTimers()
    let resolveHealth!: () => void
    vi.mocked(budgetApi.health).mockImplementation(() => new Promise(resolve => { resolveHealth = () => resolve({} as never) }))
    const ready = vi.fn()
    const view = render(<StrictMode><LoadingScreen onReady={ready} /></StrictMode>)
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(budgetApi.health).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(budgetApi.health).mock.calls[0][0]
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { resolveHealth(); await vi.advanceTimersByTimeAsync(1000) })
    expect(ready).not.toHaveBeenCalled()
  })
})
