import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { entryApi } from '../services/api'
import type { BudgetEntry } from '../types/budget'

interface MonthlyCellProps {
  categoryId: number
  month: number
  entry?: BudgetEntry
  budgetId: number
}

function MonthlyCell({ categoryId, month, entry, budgetId }: MonthlyCellProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [plannedAmount, setPlannedAmount] = useState(entry?.planned_amount || '0.00')
  const [actualAmount, setActualAmount] = useState(entry?.actual_amount || '')

  const createMutation = useMutation({
    mutationFn: (data: Partial<BudgetEntry>) => entryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsEditing(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetEntry> }) =>
      entryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsEditing(false)
    },
  })

  const handleSave = () => {
    const data = {
      category: categoryId,
      month,
      year: new Date().getFullYear(),
      planned_amount: plannedAmount,
      actual_amount: actualAmount || null,
    }

    if (entry) {
      updateMutation.mutate({ id: entry.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const getStatusColor = () => {
    if (!entry || !entry.actual_amount) return 'bg-white dark:bg-gray-800'

    switch (entry.status) {
      case 'WITHIN_BUDGET':
        return 'bg-green-50 dark:bg-green-900/20'
      case 'WARNING':
        return 'bg-yellow-50 dark:bg-yellow-900/20'
      case 'OVER_BUDGET':
        return 'bg-red-50 dark:bg-red-900/20'
      default:
        return 'bg-white dark:bg-gray-800'
    }
  }

  if (isEditing) {
    return (
      <td className="px-2 py-2">
        <div className="space-y-2">
          <input
            type="number"
            step="0.01"
            value={plannedAmount}
            onChange={(e) => setPlannedAmount(e.target.value)}
            placeholder="Geplant"
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <input
            type="number"
            step="0.01"
            value={actualAmount}
            onChange={(e) => setActualAmount(e.target.value)}
            placeholder="Ist"
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              OK
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setPlannedAmount(entry?.planned_amount || '0.00')
                setActualAmount(entry?.actual_amount || '')
              }}
              className="flex-1 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
            >
              X
            </button>
          </div>
        </div>
      </td>
    )
  }

  return (
    <td
      onClick={() => setIsEditing(true)}
      className={`px-4 py-3 text-center text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${getStatusColor()}`}
    >
      {entry ? (
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">
            {parseFloat(entry.actual_amount || entry.planned_amount).toFixed(2)}
          </div>
          {entry.actual_amount && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Plan: {parseFloat(entry.planned_amount).toFixed(2)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-400 dark:text-gray-600">-</div>
      )}
    </td>
  )
}

export default MonthlyCell
