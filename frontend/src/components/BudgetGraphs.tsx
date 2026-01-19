import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { BudgetCategory, BudgetEntry, SalaryReduction, TaxEntry, MonthlyActualBalance } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
]

const MONTHS_FULL = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

interface BudgetGraphsProps {
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  taxEntries: TaxEntry[]
  salaryReductions: SalaryReduction[]
  actualBalances: MonthlyActualBalance[]
  displayCurrency: Currency
  budgetYear: number
}

const COLORS = {
  income: '#10b981', // green
  expenses: '#ef4444', // red
  balance: '#3b82f6', // blue
  planned: '#8b5cf6', // purple
  actual: '#f59e0b', // amber
}

const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

function BudgetGraphs({
  categories,
  entries,
  taxEntries,
  salaryReductions,
  actualBalances,
  displayCurrency,
  budgetYear,
}: BudgetGraphsProps) {
  const [viewMode, setViewMode] = useState<'yearly' | 'monthly'>('monthly')
  // Get gross salary for a specific month
  const getGrossSalaryForMonth = (month: number): number => {
    const salaryCategory = categories.find(
      (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
    )
    if (!salaryCategory) return 0

    if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
      return parseFloat(salaryCategory.yearly_amount) / 12
    }

    if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
      const startMonth = salaryCategory.custom_start_month || 1
      const monthsInterval = 12 / salaryCategory.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < salaryCategory.custom_months; i++) {
        const calculatedMonth = startMonth + (i * monthsInterval)
        let paymentMonth = Math.round(calculatedMonth)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }

      if (paymentMonths.includes(month)) {
        return parseFloat(salaryCategory.yearly_amount)
      } else {
        return 0
      }
    }

    if (salaryCategory.input_mode === 'MONTHLY') {
      const salaryEntry = entries.find(
        (e) => e.category === salaryCategory.id && e.month === month
      )

      if (salaryEntry) {
        return parseFloat(salaryEntry.actual_amount || salaryEntry.planned_amount)
      }
    }

    return 0
  }

  // Calculate tax amount for a tax entry in a specific month
  const calculateTaxAmount = (tax: TaxEntry, month: number): number => {
    const salary = getGrossSalaryForMonth(month)
    if (salary === 0) return 0
    return (salary * parseFloat(tax.percentage)) / 100
  }

  // Calculate monthly totals
  const calculateMonthlyTotals = (month: number) => {
    let income = 0
    let expenses = 0
    let plannedIncome = 0
    let plannedExpenses = 0

    categories.forEach((category) => {
      let categoryAmount = 0
      let plannedAmount = 0

      if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
        const yearlyAmount = parseFloat(category.yearly_amount || '0')
        
        if (category.input_mode === 'YEARLY') {
          categoryAmount = yearlyAmount / 12
          plannedAmount = yearlyAmount / 12
        } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
          const startMonth = category.custom_start_month || 1
          const monthsInterval = 12 / category.custom_months
          const paymentMonths: number[] = []
          for (let i = 0; i < category.custom_months; i++) {
            const calculatedMonth = startMonth + (i * monthsInterval)
            let paymentMonth = Math.round(calculatedMonth)
            while (paymentMonth > 12) paymentMonth -= 12
            while (paymentMonth < 1) paymentMonth += 12
            paymentMonths.push(paymentMonth)
          }
          
          if (paymentMonths.includes(month)) {
            categoryAmount = yearlyAmount
            plannedAmount = yearlyAmount
          }
        }
      } else {
        const categoryEntries = entries.filter(
          (e) => e.category === category.id && e.month === month
        )
        categoryAmount = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.actual_amount || entry.planned_amount)
        }, 0)
        plannedAmount = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.planned_amount)
        }, 0)
      }

      if (category.category_type === 'INCOME') {
        income += categoryAmount
        plannedIncome += plannedAmount
      } else {
        expenses += categoryAmount
        plannedExpenses += plannedAmount
      }
    })

    // Add taxes to expenses
    const totalTaxes = taxEntries.reduce((sum, tax) => {
      if (tax.is_active) {
        return sum + calculateTaxAmount(tax, month)
      }
      return sum
    }, 0)

    expenses += totalTaxes
    plannedExpenses += totalTaxes

    return {
      income,
      expenses,
      balance: income - expenses,
      plannedIncome,
      plannedExpenses,
      plannedBalance: plannedIncome - plannedExpenses,
    }
  }

  // Calculate monthly data for charts
  const monthlyData = useMemo(() => {
    return MONTHS.map((monthName, index) => {
      const month = index + 1
      const totals = calculateMonthlyTotals(month)
      
      // Get actual balance if available
      const actualBalance = actualBalances.find(
        (ab) => ab.month === month && ab.year === budgetYear
      )

      return {
        month: monthName,
        monthFull: MONTHS_FULL[index],
        monthNumber: month,
        income: totals.income,
        expenses: totals.expenses,
        balance: totals.balance,
        plannedIncome: totals.plannedIncome,
        plannedExpenses: totals.plannedExpenses,
        plannedBalance: totals.plannedBalance,
        actualIncome: actualBalance ? parseFloat(actualBalance.actual_income) : null,
        actualExpenses: actualBalance ? parseFloat(actualBalance.actual_expenses) : null,
        actualBalance: actualBalance ? parseFloat(actualBalance.balance) : null,
      }
    })
  }, [categories, entries, taxEntries, salaryReductions, actualBalances, budgetYear])

  // Calculate category distribution data
  const categoryDistribution = useMemo(() => {
    const categoryTotals: Record<string, number> = {}

    categories.forEach((category) => {
      if (category.category_type === 'INCOME') return // Only show expenses

      let categoryTotal = 0

      if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
        const yearlyAmount = parseFloat(category.yearly_amount || '0')
        
        if (category.input_mode === 'YEARLY') {
          categoryTotal = yearlyAmount
        } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
          categoryTotal = yearlyAmount * category.custom_months
        }
      } else {
        const categoryEntries = entries.filter((e) => e.category === category.id)
        categoryTotal = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.actual_amount || entry.planned_amount)
        }, 0)
      }

      if (categoryTotal > 0) {
        categoryTotals[category.name] = (categoryTotals[category.name] || 0) + categoryTotal
      }
    })

    // Add taxes
    for (let month = 1; month <= 12; month++) {
      const totalTaxes = taxEntries.reduce((sum, tax) => {
        if (tax.is_active) {
          return sum + calculateTaxAmount(tax, month)
        }
        return sum
      }, 0)
      if (totalTaxes > 0) {
        categoryTotals['Steuern'] = (categoryTotals['Steuern'] || 0) + totalTaxes
      }
    }

    const result = Object.entries(categoryTotals)
      .map(([name, value]) => ({ 
        name, 
        value: viewMode === 'monthly' ? value / 12 : value 
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) // Top 10 categories
    
    return result
  }, [categories, entries, taxEntries, viewMode])

  // Calculate expense breakdown by category type
  const expenseByType = useMemo(() => {
    const typeTotals: Record<string, number> = {
      'Fixkosten': 0,
      'Variable Kosten': 0,
      'Sparen': 0,
    }

    categories.forEach((category) => {
      if (category.category_type === 'INCOME') return

      let categoryTotal = 0

      if (category.input_mode === 'YEARLY' || category.input_mode === 'CUSTOM') {
        const yearlyAmount = parseFloat(category.yearly_amount || '0')
        
        if (category.input_mode === 'YEARLY') {
          categoryTotal = yearlyAmount
        } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
          categoryTotal = yearlyAmount * category.custom_months
        }
      } else {
        const categoryEntries = entries.filter((e) => e.category === category.id)
        categoryTotal = categoryEntries.reduce((sum, entry) => {
          return sum + parseFloat(entry.actual_amount || entry.planned_amount)
        }, 0)
      }

      const typeName =
        category.category_type === 'FIXED_EXPENSE'
          ? 'Fixkosten'
          : category.category_type === 'VARIABLE_EXPENSE'
          ? 'Variable Kosten'
          : 'Sparen'

      typeTotals[typeName] += categoryTotal
    })

    // Add taxes to variable expenses
    for (let month = 1; month <= 12; month++) {
      const totalTaxes = taxEntries.reduce((sum, tax) => {
        if (tax.is_active) {
          return sum + calculateTaxAmount(tax, month)
        }
        return sum
      }, 0)
      typeTotals['Variable Kosten'] += totalTaxes
    }

    return Object.entries(typeTotals)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ 
        name, 
        value: viewMode === 'monthly' ? value / 12 : value 
      }))
  }, [categories, entries, taxEntries, viewMode])

  // Custom tooltip formatter
  const formatTooltipValue = (value: number) => {
    return formatCurrency(value, displayCurrency)
  }

  return (
    <div className="space-y-16">
      {/* Monthly Income vs Expenses */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          📈 Monatliche Einnahmen vs. Ausgaben
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-300 dark:stroke-slate-600" />
            <XAxis
              dataKey="month"
              className="text-slate-600 dark:text-slate-400"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-slate-600 dark:text-slate-400"
              tickFormatter={formatTooltipValue}
            />
            <Tooltip
              formatter={(value: number) => formatTooltipValue(value)}
              contentStyle={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="income"
              name="Einnahmen"
              stroke={COLORS.income}
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 8 }}
            />
            <Line
              type="monotone"
              dataKey="expenses"
              name="Ausgaben"
              stroke={COLORS.expenses}
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Balance Trend */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          💰 Monatliche Bilanz
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-300 dark:stroke-slate-600" />
            <XAxis
              dataKey="month"
              className="text-slate-600 dark:text-slate-400"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              tick={{ fill: 'currentColor' }}
              className="text-slate-600 dark:text-slate-400"
              tickFormatter={formatTooltipValue}
            />
            <Tooltip
              formatter={(value: number) => formatTooltipValue(value)}
              contentStyle={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="balance"
              name="Bilanz (Einnahmen - Ausgaben)"
              stroke={COLORS.balance}
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 8 }}
            />
            <Line
              type="monotone"
              dataKey="plannedBalance"
              name="Geplante Bilanz"
              stroke={COLORS.planned}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
            />
            {actualBalances.length > 0 && (
              <Line
                type="monotone"
                dataKey="actualBalance"
                name="Tatsächliche Bilanz"
                stroke={COLORS.actual}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Planned vs Actual Comparison - Only show if IST data is available */}
      {actualBalances.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            📊 Geplant vs. Tatsächlich
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-300 dark:stroke-slate-600" />
              <XAxis
                dataKey="month"
                className="text-slate-600 dark:text-slate-400"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis
                tick={{ fill: 'currentColor' }}
                className="text-slate-600 dark:text-slate-400"
                tickFormatter={formatTooltipValue}
              />
              <Tooltip
                formatter={(value: number) => formatTooltipValue(value)}
                contentStyle={{
                  backgroundColor: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Legend />
              <Bar dataKey="plannedIncome" name="Geplante Einnahmen" fill={COLORS.planned} />
              <Bar dataKey="income" name="Tatsächliche Einnahmen" fill={COLORS.income} />
              <Bar dataKey="plannedExpenses" name="Geplante Ausgaben" fill="#a855f7" />
              <Bar dataKey="expenses" name="Tatsächliche Ausgaben" fill={COLORS.expenses} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Toggle Switch for View Mode */}
      <div className="flex items-center justify-center mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4 inline-flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Ansicht:
          </span>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('yearly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'yearly'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Jahr
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'monthly'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Monat (Ø)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Distribution Pie Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            🥧 Ausgabenverteilung nach Kategorie {viewMode === 'monthly' && '(Ø pro Monat)'}
          </h2>
          {categoryDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={categoryDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatTooltipValue(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-slate-500 dark:text-slate-400">
              Keine Daten verfügbar
            </div>
          )}
        </div>

        {/* Expense Breakdown by Type */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            📊 Ausgaben nach Typ {viewMode === 'monthly' && '(Ø pro Monat)'}
          </h2>
          {expenseByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={expenseByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-300 dark:stroke-slate-600" />
                <XAxis
                  type="number"
                  tick={{ fill: 'currentColor' }}
                  className="text-slate-600 dark:text-slate-400"
                  tickFormatter={formatTooltipValue}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: 'currentColor' }}
                  className="text-slate-600 dark:text-slate-400"
                />
                <Tooltip
                  formatter={(value: number) => formatTooltipValue(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="value" fill={COLORS.expenses} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-slate-500 dark:text-slate-400">
              Keine Daten verfügbar
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BudgetGraphs
