import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExchangeRates, getExchangeRates, initializeExchangeRates, isValidExchangeRates } from './currency'

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('exchange rate reliability', () => {
  it('ignores malformed cached rates instead of displaying NaN', () => {
    for (const rates of [null, {}, { CHF: 1, EUR: 0, USD: 2, lastUpdated: 'bad' }, { CHF: 1, EUR: '1.1', USD: 2, lastUpdated: new Date().toISOString() }]) {
      localStorage.setItem('exchangeRates', JSON.stringify(rates))
      expect(getExchangeRates().EUR).toBeGreaterThan(0)
      expect(isValidExchangeRates(rates)).toBe(false)
    }
  })

  it('manual refresh reports failure while initialization can keep cached rates', async () => {
    const cached = { CHF: 1, EUR: 1.1, USD: 1.2, lastUpdated: '2020-01-01T00:00:00.000Z' }
    localStorage.setItem('exchangeRates', JSON.stringify(cached))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchExchangeRates()).rejects.toThrow('offline')
    expect(await initializeExchangeRates()).toEqual(cached)
  })

  it('rejects corrupt live data and keeps the previous cache', async () => {
    const cached = getExchangeRates()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { EUR: -1, USD: 0 } }) }))
    await expect(fetchExchangeRates()).rejects.toThrow('invalid rates')
    expect(getExchangeRates()).toEqual(cached)
  })
})
