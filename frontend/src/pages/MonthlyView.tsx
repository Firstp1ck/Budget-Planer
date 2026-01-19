import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { budgetApi } from '../services/api'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function MonthlyView() {
  const { id, month } = useParams<{ id: string; month: string }>()
  const budgetId = parseInt(id || '0')
  const monthNum = parseInt(month || '1')

  const { data: budget } = useQuery({
    queryKey: ['budget', budgetId],
    queryFn: async () => {
      const response = await budgetApi.getById(budgetId)
      return response.data
    },
    enabled: budgetId > 0,
  })

  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ['budget', budgetId, 'monthly', monthNum],
    queryFn: async () => {
      const response = await budgetApi.getMonthlySummary(budgetId, monthNum)
      return response.data
    },
    enabled: budgetId > 0 && monthNum > 0,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-6"></div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Lade Daten...</p>
        </div>
      </div>
    )
  }

  if (!monthlyData || !budget) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white dark:bg-slate-800 rounded-xl p-12 shadow-md border border-slate-200 dark:border-slate-700">
          <div className="text-7xl mb-6 animate-pulse">⚠️</div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">Daten nicht gefunden</p>
        </div>
      </div>
    )
  }

  const chartData = monthlyData.entries
    .filter((entry) => entry.category_type !== 'INCOME')
    .map((entry) => ({
      name: entry.category_name,
      value: parseFloat(entry.actual_amount || entry.planned_amount),
    }))

  return (
    <div className="min-h-screen">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 animate-fade-in">
        <div className="mb-8">
          <Link
            to={`/budget/${budgetId}`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-3 inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            ← Zurück zum Budget
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {budget.name} - {MONTHS[monthNum - 1]} {budget.year}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Einnahmen
            </h3>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {parseFloat(monthlyData.total_income).toFixed(2)} {budget.currency}
            </p>
          </div>

          <div className="glass rounded-xl shadow-md p-6 border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Ausgaben
            </h3>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {parseFloat(monthlyData.total_expenses).toFixed(2)} {budget.currency}
            </p>
          </div>

          <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700 ${
            parseFloat(monthlyData.balance) >= 0
              ? 'bg-green-50/50 dark:bg-green-900/10'
              : 'bg-red-50/50 dark:bg-red-900/10'
          }`}>
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
              Bilanz
            </h3>
            <p className={`text-2xl font-bold ${
              parseFloat(monthlyData.balance) >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {parseFloat(monthlyData.balance) >= 0 ? '+' : ''}{parseFloat(monthlyData.balance).toFixed(2)} {budget.currency}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Ausgaben-Verteilung
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Einträge
            </h2>
            <div className="space-y-2">
              {monthlyData.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {entry.category_name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {entry.category_type === 'INCOME' ? 'Einnahme' : 'Ausgabe'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {parseFloat(entry.actual_amount || entry.planned_amount).toFixed(2)} {budget.currency}
                    </p>
                    {entry.actual_amount && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Geplant: {parseFloat(entry.planned_amount).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MonthlyView
