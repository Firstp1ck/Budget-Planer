import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { actualBalanceApi } from '../services/api'
import type { MonthlyActualBalance } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'
import CellEditorDialog from './CellEditorDialog'

interface ActualBalanceCellProps {
  month: number
  balance?: MonthlyActualBalance
  budgetId: number
  budgetYear: number
  displayCurrency: Currency
  field: 'income' | 'expenses'
}
function ActualBalanceCell({ month, balance, budgetId, budgetYear, displayCurrency, field }: ActualBalanceCellProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  useEffect(() => { setIsEditing(false); setError('') }, [budgetId, budgetYear, month, field])
  const currentValue = balance ? (field === 'income' ? balance.actual_income : balance.actual_expenses) : '0.00'
  const close = () => {
    if (submitting.current) return
    setIsEditing(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const saveMutation = useMutation({
    mutationFn: (amount: string) => actualBalanceApi.setField({ budget: budgetId, year: budgetYear, month, field, value: amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      submitting.current = false
      close()
      toast.success(t('entry.updated'))
    },
    onError: () => {
      submitting.current = false
      setError(t('gridUX.saveError'))
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
    },
  })
  const handleSave = () => {
    if (submitting.current) return
    const amount = Number(value)
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setError(t('validation.enterValidAmount'))
      return
    }
    submitting.current = true
    setError('')
    saveMutation.mutate(amount.toFixed(2))
  }
  const label = t('gridUX.editBalance', { field: t(`summary.${field}`), month, year: budgetYear })
  const inputId = `balance-${budgetId}-${budgetYear}-${month}-${field}`
  if (isEditing) return <td className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400">
    <CellEditorDialog label={label} onCancel={close}>
    <form aria-label={label} className="space-y-2" onSubmit={e => { e.preventDefault(); handleSave() }} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }}>
      <label htmlFor={inputId} className="block text-xs font-medium">{t(`summary.${field}`)} (CHF)</label>
      <input id={inputId} type="number" min="0" step="0.01" required autoFocus onFocus={e => e.target.select()} value={value} disabled={saveMutation.isPending} onChange={e => setValue(e.target.value)} aria-invalid={!!error} aria-describedby={`${inputId}-help ${inputId}-error`} className="w-full px-3 py-2 text-sm border rounded dark:bg-gray-700" />
      <p id={`${inputId}-help`} className="text-xs text-gray-600 dark:text-gray-300">{t('gridUX.chfHelp')}</p>
      <p id={`${inputId}-error`} role={error ? 'alert' : undefined} className="text-xs text-red-700 dark:text-red-300">{error}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={saveMutation.isPending} className="px-3 py-2 text-xs bg-blue-600 text-white rounded disabled:opacity-50">{saveMutation.isPending ? t('category.saving') : t('common.save')}</button>
        <button type="button" onClick={close} disabled={saveMutation.isPending} className="px-3 py-2 text-xs bg-gray-200 dark:bg-gray-700 rounded">{t('common.cancel')}</button>
      </div>
    </form>
    </CellEditorDialog>
  </td>
  return <td className="px-2 py-1 text-center text-sm border bg-white dark:bg-gray-800">
    <button ref={triggerRef} type="button" aria-label={label} onClick={() => { setValue(currentValue); setError(''); setIsEditing(true) }} className="w-full min-h-[44px] px-1 py-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className="font-semibold text-xs">{balance ? formatCurrency(Number(currentValue), displayCurrency) : '-'}</span>
    </button>
  </td>
}
export default ActualBalanceCell
