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
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!monthlyData || !budget) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Daten nicht gefunden</div>
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            to={`/budget/${budgetId}`}
            className="text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
          >
            ← Zurück zum Budget
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {budget.name} - {MONTHS[monthNum - 1]} {budget.year}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Einnahmen
            </h3>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {parseFloat(monthlyData.total_income).toFixed(2)} {budget.currency}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Ausgaben
            </h3>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {parseFloat(monthlyData.total_expenses).toFixed(2)} {budget.currency}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Bilanz
            </h3>
            <p className={`text-2xl font-bold ${
              parseFloat(monthlyData.balance) >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {parseFloat(monthlyData.balance).toFixed(2)} {budget.currency}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
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

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Einträge
            </h2>
            <div className="space-y-3">
              {monthlyData.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {entry.category_name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {entry.category_type === 'INCOME' ? 'Einnahme' : 'Ausgabe'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {parseFloat(entry.actual_amount || entry.planned_amount).toFixed(2)} {budget.currency}
                    </p>
                    {entry.actual_amount && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
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
