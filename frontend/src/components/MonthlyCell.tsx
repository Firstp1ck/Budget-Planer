import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { entryApi } from '../services/api'
import type { BudgetEntry, BudgetCategory } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'
import CellEditorDialog from './CellEditorDialog'

interface MonthlyCellProps {
  categoryId: number
  month: number
  entry?: BudgetEntry
  budgetId: number
  budgetYear: number
  displayCurrency: Currency
  category: BudgetCategory
  calculatedMonthlyAmount: number
  onEditSettings: () => void
}

function MonthlyCell({ categoryId, month, entry, budgetId, budgetYear, displayCurrency, category, calculatedMonthlyAmount, onEditSettings }: MonthlyCellProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [plannedAmount, setPlannedAmount] = useState('')
  const [actualAmount, setActualAmount] = useState('')
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  useEffect(() => { setIsEditing(false); setError('') }, [budgetYear, categoryId, month, category.input_mode])
  const close = () => {
    if (submitting.current) return
    setIsEditing(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const saveMutation = useMutation({
    mutationFn: (data: Partial<BudgetEntry>) => entry ? entryApi.update(entry.id, data) : entryApi.create(data),
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
  const open = () => {
    setPlannedAmount(entry?.planned_amount ?? '0.00')
    setActualAmount(entry?.actual_amount ?? '')
    setError('')
    setIsEditing(true)
  }
  const handleSave = () => {
    if (submitting.current) return
    const planned = Number(plannedAmount)
    const actual = actualAmount.trim() === '' ? null : Number(actualAmount)
    if (plannedAmount.trim() === '' || !Number.isFinite(planned) || planned < 0 || (actual !== null && (!Number.isFinite(actual) || actual < 0))) {
      setError(t('validation.enterValidAmount'))
      return
    }
    submitting.current = true
    setError('')
    saveMutation.mutate({ category: categoryId, month, year: budgetYear, planned_amount: planned.toFixed(2), actual_amount: actual === null ? null : actual.toFixed(2) })
  }
  const allEntries = queryClient.getQueryData<{ entries: BudgetEntry[] }>(['budget', budgetId, 'summary'])?.entries ?? []
  const previous = allEntries.find(e => e.category === categoryId && e.year === budgetYear && e.month === month - 1)
  const previousEntries = allEntries.filter(e => e.category === categoryId && e.year === budgetYear && e.month < month)
  const average = previousEntries.length ? previousEntries.reduce((sum, e) => sum + Number(e.actual_amount ?? e.planned_amount), 0) / previousEntries.length : null
  const label = t('gridUX.editAmount', { category: category.name, month, year: budgetYear })
  const inputId = `plan-${categoryId}-${budgetYear}-${month}`
  const status = entry?.actual_amount != null ? { WITHIN_BUDGET: 'bg-green-50 dark:bg-green-900/20', WARNING: 'bg-yellow-50 dark:bg-yellow-900/20', OVER_BUDGET: 'bg-red-50 dark:bg-red-900/20' }[entry.status] : 'bg-white dark:bg-gray-800'

  if (isEditing) return (
    <td className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400">
      <CellEditorDialog label={label} onCancel={close}>
      <form className="space-y-2" aria-label={label} onSubmit={e => { e.preventDefault(); handleSave() }} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }}>
        <label htmlFor={inputId} className="block text-xs font-medium">{t('entry.planned')} (CHF)</label>
        <input id={inputId} type="number" min="0" step="0.01" required autoFocus value={plannedAmount} disabled={saveMutation.isPending} onFocus={e => e.target.select()} onChange={e => setPlannedAmount(e.target.value)} aria-invalid={!!error} aria-describedby={`${inputId}-help ${inputId}-error`} className="w-full px-3 py-2 text-sm border rounded dark:bg-gray-700" />
        <p id={`${inputId}-help`} className="text-xs text-gray-600 dark:text-gray-300">{t('gridUX.chfHelp')}</p>
        {(previous || average !== null) && <div className="flex flex-col gap-1">
          {previous && <button type="button" disabled={saveMutation.isPending} onClick={() => setPlannedAmount(previous.planned_amount)} className="text-xs text-left text-blue-700 dark:text-blue-300">{t('entry.previousMonth')}: {previous.planned_amount} CHF</button>}
          {average !== null && <button type="button" disabled={saveMutation.isPending} onClick={() => setPlannedAmount(average.toFixed(2))} className="text-xs text-left text-blue-700 dark:text-blue-300">{t('entry.average')}: {average.toFixed(2)} CHF</button>}
        </div>}
          <p className="text-xs text-gray-600 dark:text-gray-300">{t('gridUX.actualHelp')}</p>
          <label htmlFor={`${inputId}-actual`} className="block text-xs font-medium">{t('entry.actual')} (CHF)</label>
          <input id={`${inputId}-actual`} type="number" min="0" step="0.01" value={actualAmount} disabled={saveMutation.isPending} onChange={e => setActualAmount(e.target.value)} className="w-full px-3 py-2 text-sm border rounded dark:bg-gray-700" />
        <p id={`${inputId}-error`} role={error ? 'alert' : undefined} className="text-xs text-red-700 dark:text-red-300">{error}</p>
        <div className="flex gap-2">
          <button type="submit" disabled={saveMutation.isPending} className="px-3 py-2 text-xs bg-blue-600 text-white rounded disabled:opacity-50">{saveMutation.isPending ? t('category.saving') : t('common.save')}</button>
          <button type="button" onClick={close} disabled={saveMutation.isPending} className="px-3 py-2 text-xs bg-gray-200 dark:bg-gray-700 rounded">{t('common.cancel')}</button>
        </div>
      </form>
      </CellEditorDialog>
    </td>
  )

  if (category.input_mode !== 'MONTHLY') {
    const payments = category.input_mode === 'CUSTOM' && category.custom_months ? Array.from({ length: category.custom_months }, (_, i) => ((Math.round((category.custom_start_month ?? 1) + i * 12 / category.custom_months!) - 1) % 12) + 1) : []
    const paymentMonth = category.input_mode === 'YEARLY' || payments.includes(month)
    return <td className="px-3 py-2 text-center text-sm border bg-blue-50 dark:bg-blue-900/10">
      <button type="button" onClick={onEditSettings} aria-label={t('gridUX.editGlobalSettings', { category: category.name })} title={t('gridUX.globalHelp')} className="w-full min-h-[44px] rounded focus-visible:ring-2 focus-visible:ring-blue-500">
        <span className="block font-semibold text-xs">{paymentMonth ? formatCurrency(calculatedMonthlyAmount, displayCurrency) : '-'}</span>
        <span className="block text-xs text-blue-700 dark:text-blue-300">{paymentMonth ? t('inputMode.calculated') : t('gridUX.noPayment')}</span>
      </button>
    </td>
  }
  return <td className={`px-2 py-1 text-center text-sm border ${status}`}>
    <button ref={triggerRef} type="button" onClick={open} aria-label={label} className="w-full min-h-[44px] px-1 py-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className="block font-semibold text-xs">{entry ? formatCurrency(Number(entry.actual_amount ?? entry.planned_amount), displayCurrency) : '-'}</span>
      {entry?.actual_amount != null && <span className="sr-only">{t(`gridUX.status.${entry.status}`)}</span>}
      {entry?.actual_amount != null && <span className="block text-xs text-gray-600 dark:text-gray-300">{t('entry.plan')}: {formatCurrency(Number(entry.planned_amount), displayCurrency)}</span>}
    </button>
  </td>
}
export default MonthlyCell
