// Currency conversion utilities
// Base currency is always CHF in the database

export type Currency = 'EUR' | 'CHF' | 'USD'

export interface ExchangeRates {
  EUR: number
  CHF: number
  USD: number
  lastUpdated: string
}

// Fallback exchange rates (only used if API fetch fails and no cached rates exist)
// CHF = 1.00 (base)
// These are approximate rates as of January 2026 - should be replaced by API fetch
const FALLBACK_RATES: ExchangeRates = {
  CHF: 1.00,
  EUR: 1.0753,
  USD: 1.1613,
  lastUpdated: new Date(0).toISOString(), // Set to epoch to force fetch
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '€',
  CHF: 'CHF',
  USD: '$',
}

export const CURRENCY_NAMES: Record<Currency, string> = {
  EUR: 'Euro',
  CHF: 'Schweizer Franken',
  USD: 'US-Dollar',
}

// Get exchange rates from localStorage or use fallback
// Priority: 1. Valid cached rates (< 24h) 2. Any cached rates 3. Fallback rates
export function getExchangeRates(): ExchangeRates {
  try {
    const stored = localStorage.getItem('exchangeRates')
    if (stored) {
      const rates = JSON.parse(stored) as ExchangeRates
      const lastUpdated = new Date(rates.lastUpdated)
      const now = new Date()
      const hoursDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)

      // Return cached rates even if old - they're better than fallback
      // Caller should check age and fetch new ones if needed
      return rates
    }
  } catch (error) {
    console.error('Error reading exchange rates from localStorage:', error)
  }

  // Return fallback rates only if nothing is cached
  console.warn('No cached exchange rates found, using fallback rates. Will attempt to fetch live rates.')
  return FALLBACK_RATES
}

// Save exchange rates to localStorage
export function saveExchangeRates(rates: ExchangeRates): void {
  try {
    localStorage.setItem('exchangeRates', JSON.stringify(rates))
  } catch (error) {
    console.error('Error saving exchange rates to localStorage:', error)
  }
}

// Convert amount from CHF (base currency) to target currency
export function convertCurrency(
  amount: number,
  targetCurrency: Currency,
  rates: ExchangeRates = getExchangeRates()
): number {
  if (targetCurrency === 'CHF') {
    return amount
  }

  return amount * rates[targetCurrency]
}

// Format amount with currency symbol
export function formatCurrency(
  amount: number,
  currency: Currency,
  convert: boolean = true,
  rates?: ExchangeRates
): string {
  const finalAmount = convert ? convertCurrency(amount, currency, rates) : amount
  const symbol = CURRENCY_SYMBOLS[currency]

  if (currency === 'CHF') {
    return `${finalAmount.toFixed(2)} ${symbol}`
  } else if (currency === 'USD') {
    return `${symbol}${finalAmount.toFixed(2)}`
  } else {
    return `${finalAmount.toFixed(2)} ${symbol}`
  }
}

// Fetch latest exchange rates from API
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    console.log('Fetching live exchange rates from API...')
    // Using exchangerate-api.com free tier (supports CHF as base)
    // Alternative: https://api.frankfurter.app/latest?from=CHF
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CHF', {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    const data = await response.json()

    const rates: ExchangeRates = {
      CHF: 1.00,
      EUR: data.rates.EUR || FALLBACK_RATES.EUR,
      USD: data.rates.USD || FALLBACK_RATES.USD,
      lastUpdated: new Date().toISOString(),
    }

    saveExchangeRates(rates)
    console.log('Exchange rates fetched and saved successfully:', rates)
    return rates
  } catch (error) {
    console.error('Error fetching exchange rates from API:', error)

    // Try to use cached rates as fallback
    const cached = getExchangeRates()
    if (cached.lastUpdated !== FALLBACK_RATES.lastUpdated) {
      console.log('Using cached exchange rates as fallback')
      return cached
    }

    // If no cached rates, use fallback and save them
    console.warn('Using fallback exchange rates')
    saveExchangeRates(FALLBACK_RATES)
    return FALLBACK_RATES
  }
}

// Get selected currency from localStorage
export function getSelectedCurrency(): Currency {
  try {
    const stored = localStorage.getItem('selectedCurrency')
    if (stored && ['EUR', 'CHF', 'USD'].includes(stored)) {
      return stored as Currency
    }
  } catch (error) {
    console.error('Error reading selected currency from localStorage:', error)
  }
  return 'CHF'
}

// Save selected currency to localStorage
export function setSelectedCurrency(currency: Currency): void {
  try {
    localStorage.setItem('selectedCurrency', currency)
  } catch (error) {
    console.error('Error saving selected currency to localStorage:', error)
  }
}

// Check if exchange rates need updating (older than 24 hours or never fetched)
export function shouldUpdateRates(): boolean {
  const rates = getExchangeRates()
  const lastUpdated = new Date(rates.lastUpdated)
  const now = new Date()
  const hoursDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)

  return hoursDiff >= 24
}

// Initialize exchange rates - call this on app startup
export async function initializeExchangeRates(): Promise<ExchangeRates> {
  if (shouldUpdateRates()) {
    console.log('Exchange rates need updating, fetching from API...')
    return await fetchExchangeRates()
  } else {
    console.log('Using cached exchange rates')
    return getExchangeRates()
  }
}
