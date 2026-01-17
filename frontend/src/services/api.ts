import axios from 'axios'
import type {
  Budget,
  BudgetCategory,
  BudgetEntry,
  BudgetTemplate,
  BudgetSummaryData,
  MonthlySummary,
  YearlySummary,
} from '../types/budget'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Budget endpoints
export const budgetApi = {
  getAll: () => api.get<Budget[]>('/budgets/'),
  getById: (id: number) => api.get<Budget>(`/budgets/${id}/`),
  create: (data: Partial<Budget>) => api.post<Budget>('/budgets/', data),
  update: (id: number, data: Partial<Budget>) => api.put<Budget>(`/budgets/${id}/`, data),
  delete: (id: number) => api.delete(`/budgets/${id}/`),
  getSummary: (id: number) => api.get<BudgetSummaryData>(`/budgets/${id}/summary/`),
  getMonthlySummary: (id: number, month: number) =>
    api.get<MonthlySummary>(`/budgets/${id}/monthly/${month}/`),
  getYearlySummary: (id: number) =>
    api.get<YearlySummary>(`/budgets/${id}/yearly/`),
}

// Category endpoints
export const categoryApi = {
  getAll: (budgetId: number) => api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories/`),
  create: (budgetId: number, data: Partial<BudgetCategory>) =>
    api.post<BudgetCategory>(`/budgets/${budgetId}/categories/`, data),
  update: (id: number, data: Partial<BudgetCategory>) =>
    api.put<BudgetCategory>(`/categories/${id}/`, data),
  delete: (id: number) => api.delete(`/categories/${id}/`),
  reorder: (id: number, order: number) =>
    api.patch<BudgetCategory>(`/categories/${id}/reorder/`, { order }),
}

// Entry endpoints
export const entryApi = {
  getAll: (params?: { category?: number; month?: number; year?: number }) =>
    api.get<BudgetEntry[]>('/entries/', { params }),
  create: (data: Partial<BudgetEntry>) => api.post<BudgetEntry>('/entries/', data),
  update: (id: number, data: Partial<BudgetEntry>) =>
    api.put<BudgetEntry>(`/entries/${id}/`, data),
  updateActual: (id: number, actual_amount: string) =>
    api.patch<BudgetEntry>(`/entries/${id}/actual/`, { actual_amount }),
  delete: (id: number) => api.delete(`/entries/${id}/`),
}

// Template endpoints
export const templateApi = {
  getAll: () => api.get<BudgetTemplate[]>('/templates/'),
  create: (data: Partial<BudgetTemplate>) => api.post<BudgetTemplate>('/templates/', data),
  delete: (id: number) => api.delete(`/templates/${id}/`),
}

export default api
