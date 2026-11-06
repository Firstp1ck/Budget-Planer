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

// Reject accidental HTML responses without logging budget contents.
api.interceptors.response.use((response) => {
  const contentType = response.headers['content-type'] || ''
  if (contentType.includes('text/html') && typeof response.data === 'string') {
    throw new Error('API returned HTML instead of JSON. Please check the backend connection.')
  }
  return response
})

// Fetch all pages so search and template selection cover the complete collection.
async function getAllPages<T>(path: string) {
  const response = await api.get<PaginatedResponse<T>>(path)
  const results = [...response.data.results]
  let next = response.data.next
  const visited = new Set<string>()
  while (next) {
    if (visited.has(next)) throw new Error('The server returned repeated pagination data.')
    visited.add(next)
    const page = new URL(next, 'http://localhost').searchParams.get('page')
    if (!page) throw new Error('The server returned invalid pagination data.')
    const nextResponse = await api.get<PaginatedResponse<T>>(path, { params: { page } })
    results.push(...nextResponse.data.results)
    next = nextResponse.data.next
  }
  return { ...response, data: { ...response.data, results, count: results.length, next: null } }
}

// Budget endpoints
export const budgetApi = {
  getAll: () => getAllPages<Budget>('/budgets/'),
  getById: (id: number) => api.get<Budget>(`/budgets/${id}/`),
  create: (data: Partial<Budget>) => api.post<Budget>('/budgets/', data),
  update: (id: number, data: Partial<Budget>) => api.put<Budget>(`/budgets/${id}/`, data),
  delete: (id: number) => api.delete(`/budgets/${id}/`),
  getSummary: (id: number) => api.get<BudgetSummaryData>(`/budgets/${id}/summary/`),
  getMonthlySummary: (id: number, month: number, year: number) =>
    api.get<MonthlySummary>(`/budgets/${id}/monthly/${month}/`, { params: { year } }),
  getYearlySummary: (id: number, year: number) =>
    api.get<YearlySummary>(`/budgets/${id}/yearly/`, { params: { year } }),
  export: (id: number) => api.get<BudgetSummaryData>(`/budgets/${id}/export_json/`),
  // Import has a longer timeout (60s) because large budgets can take time to process
  import: (data: BudgetSummaryData) => api.post<Budget>('/budgets/import/', data, { timeout: 60000 }),
  health: (signal?: AbortSignal) => api.get<{status: string, message: string}>('/budgets/health/', { signal }),
}

// Category endpoints
export const categoryApi = {
  getAll: (budgetId: number) => api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories/`),
  create: (budgetId: number, data: Partial<BudgetCategory>) =>
    api.post<BudgetCategory>(`/budgets/${budgetId}/add_category/`, data),
  update: (id: number, data: Partial<BudgetCategory>) =>
    api.patch<BudgetCategory>(`/categories/${id}/`, data),
  delete: (id: number) => api.delete(`/categories/${id}/`),
  planEntries: (id: number, data: { year: number; entries: { month: number; planned_amount: string }[] }) =>
    api.post<BudgetEntry[]>(`/categories/${id}/plan_entries/`, data),
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
  setField: (data: { budget: number; year: number; month: number; field: 'income' | 'expenses'; value: string }) =>
    api.post<MonthlyActualBalance>('/actual-balances/set_field/', data),
  getAll: (params?: { budget?: number; month?: number; year?: number }) =>
    api.get<PaginatedResponse<MonthlyActualBalance>>('/actual-balances/', { params }),
  create: (data: Partial<MonthlyActualBalance>) => api.post<MonthlyActualBalance>('/actual-balances/', data),
  update: (id: number, data: Partial<MonthlyActualBalance>) =>
    api.patch<MonthlyActualBalance>(`/actual-balances/${id}/`, data),
  delete: (id: number) => api.delete(`/actual-balances/${id}/`),
}

// Template endpoints
export const templateApi = {
  getAll: () => getAllPages<BudgetTemplate>('/templates/'),
  create: (data: Partial<BudgetTemplate>) => api.post<BudgetTemplate>('/templates/', data),
  createFromBudget: (budgetId: number, name: string, overwrite?: boolean) =>
    api.post<BudgetTemplate>('/templates/create_from_budget/', { budget_id: budgetId, name, overwrite: overwrite || false }),
  apply: (templateId: number, budgetId: number) =>
    api.post(`/templates/${templateId}/apply/`, { budget_id: budgetId }),
  delete: (id: number) => api.delete(`/templates/${id}/`),
}

export default api
