import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
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
      toast.success('Eintrag erstellt')
    },
    onError: () => {
      toast.error('Fehler beim Erstellen des Eintrags')
      setIsEditing(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetEntry> }) =>
      entryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsEditing(false)
      toast.success('Eintrag aktualisiert')
    },
    onError: () => {
      toast.error('Fehler beim Aktualisieren des Eintrags')
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
        return 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
      case 'WARNING':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
      case 'OVER_BUDGET':
        return 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
      default:
        return 'bg-white dark:bg-gray-800'
    }
  }

  if (isEditing) {
    return (
      <td className="px-3 py-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600">
        <div className="space-y-2 min-w-[160px]">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Geplant
            </label>
            <input
              type="number"
              step="0.01"
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ist
            </label>
            <input
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <span className="flex items-center justify-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  ...
                </span>
              ) : (
                '✓ OK'
              )}
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setPlannedAmount(entry?.planned_amount || '0.00')
                setActualAmount(entry?.actual_amount || '')
              }}
              className="flex-1 px-3 py-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 font-semibold"
            >
              ✕
            </button>
          </div>
        </div>
      </td>
    )
  }

  return (
    <td
      onClick={() => setIsEditing(true)}
      className={`px-6 py-4 text-center text-base cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border ${getStatusColor()}`}
      title="Klicken zum Bearbeiten"
    >
      {entry ? (
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">
            {parseFloat(entry.actual_amount || entry.planned_amount).toFixed(2)} €
          </div>
          {entry.actual_amount && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Plan: {parseFloat(entry.planned_amount).toFixed(2)} €
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-400 dark:text-gray-600 text-xl">-</div>
      )}
    </td>
  )
}

export default MonthlyCell
