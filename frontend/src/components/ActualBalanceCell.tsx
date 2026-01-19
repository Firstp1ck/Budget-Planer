import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { actualBalanceApi } from '../services/api'
import type { MonthlyActualBalance } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface ActualBalanceCellProps {
  month: number
  balance?: MonthlyActualBalance
  budgetId: number
  budgetYear: number
  displayCurrency: Currency
  field: 'income' | 'expenses'
}

function ActualBalanceCell({ month, balance, budgetId, budgetYear, displayCurrency, field }: ActualBalanceCellProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(balance ? (field === 'income' ? balance.actual_income : balance.actual_expenses) : '0.00')
  const cellRef = useRef<HTMLDivElement>(null)

  const createMutation = useMutation({
    mutationFn: (data: Partial<MonthlyActualBalance>) => actualBalanceApi.create(data),
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
    mutationFn: ({ id, data }: { id: number; data: Partial<MonthlyActualBalance> }) =>
      actualBalanceApi.update(id, data),
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
    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue < 0) {
      toast.error('Bitte geben Sie einen gültigen Betrag ein')
      return
    }

    const data: Partial<MonthlyActualBalance> = {
      budget: budgetId,
      month,
      year: budgetYear,
      actual_income: field === 'income' ? numValue.toFixed(2) : (balance?.actual_income || '0.00'),
      actual_expenses: field === 'expenses' ? numValue.toFixed(2) : (balance?.actual_expenses || '0.00'),
    }

    if (balance) {
      updateMutation.mutate({ id: balance.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  // Handle keyboard events for the entire editing cell
  useEffect(() => {
    if (!isEditing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditing(false)
        setValue(balance ? (field === 'income' ? balance.actual_income : balance.actual_expenses) : '0.00')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEditing, value, balance, field, budgetId, month, budgetYear, updateMutation, createMutation])

  if (isEditing) {
    return (
      <td className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600">
        <div ref={cellRef} className="space-y-2 min-w-[150px]" tabIndex={-1}>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              {field === 'income' ? 'Einnahmen' : 'Ausgaben'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setIsEditing(false)
                  setValue(balance ? (field === 'income' ? balance.actual_income : balance.actual_expenses) : '0.00')
                }
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <span className="flex items-center justify-center gap-1">
                  <div className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-white"></div>
                  ...
                </span>
              ) : (
                '✓ OK'
              )}
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setValue(balance ? (field === 'income' ? balance.actual_income : balance.actual_expenses) : '0.00')
              }}
              className="flex-1 px-3 py-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 font-semibold"
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
      className="px-3 py-2 text-center text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border bg-white dark:bg-gray-800"
      title="Klicken zum Bearbeiten"
    >
      {balance ? (
        <div className="font-semibold text-xs text-gray-900 dark:text-white">
          {formatCurrency(parseFloat(field === 'income' ? balance.actual_income : balance.actual_expenses), displayCurrency)}
        </div>
      ) : (
        <div className="text-gray-400 dark:text-gray-600 text-sm">-</div>
      )}
    </td>
  )
}

export default ActualBalanceCell
