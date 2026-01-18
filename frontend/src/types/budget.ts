export type CategoryType = 'INCOME' | 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE' | 'SAVINGS'

export type InputMode = 'MONTHLY' | 'YEARLY' | 'CUSTOM'

export type BudgetStatus = 'WITHIN_BUDGET' | 'WARNING' | 'OVER_BUDGET'

export interface Budget {
  id: number
  name: string
  year: number
  currency: string
  created_at: string
  updated_at: string
}

export interface BudgetCategory {
  id: number
  budget: number
  name: string
  category_type: CategoryType
  order: number
  is_active: boolean
  input_mode: InputMode
  custom_months: number | null
  yearly_amount: string | null
}

export interface BudgetEntry {
  id: number
  category: number
  month: number
  year: number
  planned_amount: string
  actual_amount: string | null
  notes: string
  status: BudgetStatus
}

export interface BudgetTemplate {
  id: number
  name: string
  categories: CategoryTemplateItem[]
}

export interface CategoryTemplateItem {
  name: string
  category_type: CategoryType
  order: number
}

export interface MonthlySummary {
  month: number
  year: number
  total_income: string
  total_expenses: string
  balance: string
  entries: BudgetEntry[]
}

export interface YearlySummary {
  year: number
  total_income: string
  total_expenses: string
  balance: string
  monthly_summaries: MonthlySummary[]
}

export type ReductionType = 'PERCENTAGE' | 'FIXED'

export interface SalaryReduction {
  id: number
  budget: number
  name: string
  reduction_type: ReductionType
  reduction_type_display: string
  value: string
  order: number
  is_active: boolean
}

export interface TaxEntry {
  id: number
  budget: number
  name: string
  percentage: string
  order: number
  is_active: boolean
}

export interface BudgetSummaryData {
  budget: Budget
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  tax_entries: TaxEntry[]
  salary_reductions: SalaryReduction[]
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
