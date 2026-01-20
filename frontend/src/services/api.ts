import axios from 'axios'
import type {
  Budget,
  BudgetCategory,
  BudgetEntry,
  BudgetTemplate,
  TaxEntry,
  SalaryReduction,
  BudgetSummaryData,
  MonthlySummary,
  YearlySummary,
  PaginatedResponse,
  MonthlyActualBalance,
} from '../types/budget'

// Determine API base URL based on environment
// In Tauri, we need to use the full URL since proxy doesn't work
// In development (Vite dev server), the proxy handles /api
const getBaseURL = () => {
  // Check if we're running in Tauri or production build
  // Multiple ways to detect Tauri:
  // 1. Check for Tauri global object
  // 2. Check window.location.protocol (tauri://)
  // 3. Check environment variable
  // 4. Check if we're in a built app (not localhost:5173)
  let isTauri = false
  let isProduction = import.meta.env.PROD
  
  if (typeof window !== 'undefined') {
    const href = window.location.href
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    
    // Check for Tauri global object (most reliable)
    isTauri = (window as any).__TAURI__ !== undefined ||
              (window as any).__TAURI_INTERNALS__ !== undefined ||
              // Check for tauri:// protocol
              protocol === 'tauri:' ||
              href.startsWith('tauri://') ||
              // Check environment variable
              import.meta.env.VITE_TAURI === 'true' ||
              // If in production mode and not on localhost:5173, assume Tauri
              (isProduction && hostname !== 'localhost' && !href.includes('localhost:5173') && !href.includes('127.0.0.1:5173'))
  }
  
  // Always use full URL in production/Tauri, use proxy in dev
  if (isTauri || isProduction) {
    // Use environment variable or default to localhost:8000
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
    console.log('Using full API URL:', apiUrl, '(Tauri:', isTauri, ', Production:', isProduction, ')')
    console.log('Current location:', typeof window !== 'undefined' ? window.location.href : 'N/A')
    return apiUrl
  }
  // In Vite dev server, use relative path (proxy will handle it)
  console.log('Using dev server proxy API URL: /api')
  return '/api'
}

const baseURL = getBaseURL()

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
})

// Log API configuration on startup
if (typeof window !== 'undefined') {
  console.log('=== API Configuration ===')
  console.log('Base URL:', baseURL)
  console.log('Window location:', window.location.href)
  console.log('Protocol:', window.location.protocol)
  console.log('Hostname:', window.location.hostname)
  console.log('Tauri detected:', (window as any).__TAURI__ !== undefined)
  console.log('Production mode:', import.meta.env.PROD)
  console.log('=======================')
}

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url)
    
    // Check if we got HTML instead of JSON (common when API URL is wrong)
    const contentType = response.headers['content-type'] || ''
    if (contentType.includes('text/html') && typeof response.data === 'string' && response.data.includes('<!doctype')) {
      console.error('Received HTML instead of JSON! This usually means the API URL is incorrect.')
      console.error('Response URL:', response.config.url)
      console.error('Base URL:', response.config.baseURL)
      throw new Error('API returned HTML instead of JSON. Backend server may not be running or API URL is incorrect.')
    }
    
    return response
  },
  (error) => {
    console.error('API Response Error:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
      
      // Check if we got HTML error page
      const contentType = error.response.headers['content-type'] || ''
      if (contentType.includes('text/html')) {
        console.error('Received HTML error page instead of JSON response')
        console.error('This usually means:')
        console.error('1. Backend server is not running')
        console.error('2. API URL is incorrect')
        console.error('3. Request is being routed to frontend instead of backend')
        error.isHtmlResponse = true
      }
    } else if (error.request) {
      console.error('No response received:', error.request)
      console.error('This usually means the backend server is not running at http://localhost:8000')
    }
    return Promise.reject(error)
  }
)

// Budget endpoints
export const budgetApi = {
  getAll: () => api.get<PaginatedResponse<Budget>>('/budgets/'),
  getById: (id: number) => api.get<Budget>(`/budgets/${id}/`),
  create: (data: Partial<Budget>) => api.post<Budget>('/budgets/', data),
  update: (id: number, data: Partial<Budget>) => api.put<Budget>(`/budgets/${id}/`, data),
  delete: (id: number) => api.delete(`/budgets/${id}/`),
  getSummary: (id: number) => api.get<BudgetSummaryData>(`/budgets/${id}/summary/`),
  getMonthlySummary: (id: number, month: number, year: number) =>
    api.get<MonthlySummary>(`/budgets/${id}/monthly/${month}/`, { params: { year } }),
  getYearlySummary: (id: number, year: number) =>
    api.get<YearlySummary>(`/budgets/${id}/yearly/`, { params: { year } }),
  export: (id: number) => api.get<BudgetSummaryData>(`/budgets/${id}/summary/`),
  import: (data: BudgetSummaryData) => api.post<Budget>('/budgets/import/', data),
  health: () => api.get<{status: string, message: string}>('/budgets/health/'),
}

// Category endpoints
export const categoryApi = {
  getAll: (budgetId: number) => api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories/`),
  create: (budgetId: number, data: Partial<BudgetCategory>) =>
    api.post<BudgetCategory>(`/budgets/${budgetId}/add_category/`, data),
  update: (id: number, data: Partial<BudgetCategory>) =>
    api.patch<BudgetCategory>(`/categories/${id}/`, data),
  delete: (id: number) => api.delete(`/categories/${id}/`),
  reorder: (id: number, order: number) =>
    api.patch<BudgetCategory>(`/categories/${id}/reorder/`, { order }),
}

// Entry endpoints
export const entryApi = {
  getAll: (params?: { category?: number; month?: number; year?: number }) =>
    api.get<PaginatedResponse<BudgetEntry>>('/entries/', { params }),
  create: (data: Partial<BudgetEntry>) => api.post<BudgetEntry>('/entries/', data),
  update: (id: number, data: Partial<BudgetEntry>) =>
    api.patch<BudgetEntry>(`/entries/${id}/`, data),
  updateActual: (id: number, actual_amount: string) =>
    api.patch<BudgetEntry>(`/entries/${id}/actual/`, { actual_amount }),
  delete: (id: number) => api.delete(`/entries/${id}/`),
}

// Tax endpoints
export const salaryReductionApi = {
  getAll: (budgetId: number) => api.get<SalaryReduction[]>(`/salary-reductions/`, { params: { budget: budgetId } }),
  create: (data: Partial<SalaryReduction>) => api.post<SalaryReduction>('/salary-reductions/', data),
  update: (id: number, data: Partial<SalaryReduction>) => api.patch<SalaryReduction>(`/salary-reductions/${id}/`, data),
  delete: (id: number) => api.delete(`/salary-reductions/${id}/`),
}

export const taxApi = {
  getAll: (budgetId: number) => api.get<TaxEntry[]>(`/taxes/`, { params: { budget: budgetId } }),
  create: (data: Partial<TaxEntry>) => api.post<TaxEntry>('/taxes/', data),
  update: (id: number, data: Partial<TaxEntry>) => api.patch<TaxEntry>(`/taxes/${id}/`, data),
  delete: (id: number) => api.delete(`/taxes/${id}/`),
}

// Actual Balance endpoints
export const actualBalanceApi = {
  getAll: (params?: { budget?: number; month?: number; year?: number }) =>
    api.get<PaginatedResponse<MonthlyActualBalance>>('/actual-balances/', { params }),
  create: (data: Partial<MonthlyActualBalance>) => api.post<MonthlyActualBalance>('/actual-balances/', data),
  update: (id: number, data: Partial<MonthlyActualBalance>) =>
    api.patch<MonthlyActualBalance>(`/actual-balances/${id}/`, data),
  delete: (id: number) => api.delete(`/actual-balances/${id}/`),
}

// Template endpoints
export const templateApi = {
  getAll: () => api.get<PaginatedResponse<BudgetTemplate>>('/templates/'),
  create: (data: Partial<BudgetTemplate>) => api.post<BudgetTemplate>('/templates/', data),
  createFromBudget: (budgetId: number, name: string, overwrite?: boolean) =>
    api.post<BudgetTemplate>('/templates/create_from_budget/', { budget_id: budgetId, name, overwrite: overwrite || false }),
  apply: (templateId: number, budgetId: number) =>
    api.post(`/templates/${templateId}/apply/`, { budget_id: budgetId }),
  delete: (id: number) => api.delete(`/templates/${id}/`),
}

export default api
