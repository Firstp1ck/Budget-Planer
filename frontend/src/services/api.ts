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

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

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
