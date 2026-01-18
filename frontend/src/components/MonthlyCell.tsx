import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { entryApi, categoryApi } from '../services/api'
import type { BudgetEntry, BudgetCategory } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface MonthlyCellProps {
  categoryId: number
  month: number
  entry?: BudgetEntry
  budgetId: number
  displayCurrency: Currency
  category: BudgetCategory
  calculatedMonthlyAmount: number
}

function MonthlyCell({ categoryId, month, entry, budgetId, displayCurrency, category, calculatedMonthlyAmount }: MonthlyCellProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [plannedAmount, setPlannedAmount] = useState(entry?.planned_amount || '0.00')
  const [actualAmount, setActualAmount] = useState(entry?.actual_amount || '')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Get previous month entry for this category
  const getPreviousMonthEntry = (): BudgetEntry | undefined => {
    const allEntries = queryClient.getQueryData<{ entries: BudgetEntry[] }>(['budget', budgetId, 'summary'])?.entries || []
    const previousMonth = month === 1 ? 12 : month - 1
    return allEntries.find(e => e.category === categoryId && e.month === previousMonth)
  }

  // Calculate average from all previous months this year
  const getAverageAmount = (): number => {
    const allEntries = queryClient.getQueryData<{ entries: BudgetEntry[] }>(['budget', budgetId, 'summary'])?.entries || []
    const categoryEntries = allEntries.filter(e => e.category === categoryId && e.month < month)

    if (categoryEntries.length === 0) return 0

    const total = categoryEntries.reduce((sum, e) => {
      return sum + parseFloat(e.actual_amount || e.planned_amount)
    }, 0)

    return total / categoryEntries.length
  }

  const previousEntry = getPreviousMonthEntry()
  const averageAmount = getAverageAmount()

  // Calculate which months should have payments for CUSTOM mode (evenly distributed across year)
  const getPaymentMonths = (): number[] => {
    if (category.input_mode !== 'CUSTOM' || !category.custom_months) {
      return []
    }
    const startMonth = 1 // Always start from January
    const monthsInterval = 12 / category.custom_months
    const paymentMonths: number[] = []
    for (let i = 0; i < category.custom_months; i++) {
      // Calculate the month number (1-12)
      const calculatedMonth = startMonth + (i * monthsInterval)
      // Round to nearest integer and ensure it's within 1-12 range
      let paymentMonth = Math.round(calculatedMonth)
      // Handle wrap-around (shouldn't happen, but just in case)
      while (paymentMonth > 12) paymentMonth -= 12
      while (paymentMonth < 1) paymentMonth += 12
      paymentMonths.push(paymentMonth)
    }
    return paymentMonths
  }

  const paymentMonths = getPaymentMonths()
  const isPaymentMonth = paymentMonths.includes(month)

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

  const distributeCustomAmountMutation = useMutation({
    mutationFn: async ({ firstMonthValue }: { firstMonthValue: number }) => {
      if (category.input_mode !== 'CUSTOM' || !category.custom_months || month !== 1) {
        throw new Error('Distribution only works for first month in CUSTOM mode')
      }

      // The value entered in the first month is the amount per payment
      const paymentAmount = firstMonthValue
      const totalAmount = paymentAmount * category.custom_months
      const year = new Date().getFullYear()

      // Calculate which months should have payments (evenly distributed across the year)
      // Formula: startMonth + (i * (12 / custom_months)) for i = 0, 1, 2, ..., custom_months-1
      const monthsInterval = 12 / category.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < category.custom_months; i++) {
        // Calculate the month number (1-12)
        const calculatedMonth = month + (i * monthsInterval)
        // Round to nearest integer and ensure it's within 1-12 range
        let paymentMonth = Math.round(calculatedMonth)
        // Handle wrap-around (shouldn't happen, but just in case)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }

      // Update category yearly_amount
      await categoryApi.update(category.id, {
        yearly_amount: totalAmount.toFixed(2),
      })

      // Get all entries for this category
      const allEntries = queryClient.getQueryData<{ entries: BudgetEntry[] }>(['budget', budgetId, 'summary'])?.entries || []
      const categoryEntries = allEntries.filter(e => e.category === categoryId)

      // Create/update entries for the calculated payment months
      const promises = []
      for (const paymentMonth of paymentMonths) {
        const existingEntry = categoryEntries.find(e => e.month === paymentMonth)
        
        if (existingEntry) {
          promises.push(
            entryApi.update(existingEntry.id, {
              planned_amount: paymentAmount.toFixed(2),
            })
          )
        } else {
          promises.push(
            entryApi.create({
              category: categoryId,
              month: paymentMonth,
              year: year,
              planned_amount: paymentAmount.toFixed(2),
              actual_amount: null,
            })
          )
        }
      }

      // Delete entries that are not in the payment months
      const entriesToDelete = categoryEntries.filter(e => !paymentMonths.includes(e.month))
      for (const entryToDelete of entriesToDelete) {
        promises.push(entryApi.delete(entryToDelete.id))
      }

      await Promise.all(promises)
      return { totalAmount, paymentAmount, months: category.custom_months, paymentMonths }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setIsEditing(false)
      toast.success(`${result.months} Zahlungen à ${formatCurrency(result.paymentAmount, displayCurrency)} in Monaten ${result.paymentMonths.join(', ')}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Fehler beim Verteilen')
      setIsEditing(false)
    },
  })

  const handleSave = () => {
    // Special handling for CUSTOM mode first month
    if (category.input_mode === 'CUSTOM' && category.custom_months && month === 1) {
      const firstMonthValue = parseFloat(plannedAmount)
      if (isNaN(firstMonthValue) || firstMonthValue <= 0) {
        toast.error('Bitte geben Sie einen gültigen Betrag ein')
        return
      }
      distributeCustomAmountMutation.mutate({ firstMonthValue })
      return
    }

    // Normal handling for other cases
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
        <div className="space-y-2 min-w-[150px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Geplant
              </label>
              {(previousEntry || averageAmount > 0) && (
                <button
                  type="button"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  title="Vorschläge anzeigen"
                >
                  💡 Vorschläge
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            {showSuggestions && (
              <div className="mt-1 space-y-0.5">
                {previousEntry && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlannedAmount(previousEntry.actual_amount || previousEntry.planned_amount)
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-500"
                  >
                    📅 Vormonat: {parseFloat(previousEntry.actual_amount || previousEntry.planned_amount).toFixed(2)}
                  </button>
                )}
                {averageAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlannedAmount(averageAmount.toFixed(2))
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-500"
                  >
                    📊 Durchschnitt: {averageAmount.toFixed(2)}
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ist
            </label>
            <input
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2 pt-2">
            {category.input_mode === 'CUSTOM' && category.custom_months && month === 1 && (
              <div className="text-[10px] text-blue-600 dark:text-blue-400 mb-1">
                ℹ️ {formatCurrency(parseFloat(plannedAmount || '0'), displayCurrency)} pro Zahlung, {category.custom_months}x über das Jahr verteilt
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || distributeCustomAmountMutation.isPending}
              className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending || distributeCustomAmountMutation.isPending) ? (
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
                setPlannedAmount(entry?.planned_amount || '0.00')
                setActualAmount(entry?.actual_amount || '')
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

  // For YEARLY mode, show calculated amount (read-only display)
  if (category.input_mode === 'YEARLY' && calculatedMonthlyAmount > 0) {
    const hasExistingEntry = entry && (entry.planned_amount !== '0' || entry.actual_amount)

    return (
      <td
        className={`px-3 py-3 text-center text-sm border ${hasExistingEntry ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-blue-50 dark:bg-blue-900/10'}`}
        title={`Berechnet: Jahresbetrag / 12${hasExistingEntry ? ' (überschreibt vorhandenen Eintrag)' : ''}`}
      >
        <div>
          <div className={`font-semibold text-xs ${hasExistingEntry ? 'text-yellow-700 dark:text-yellow-300' : 'text-blue-700 dark:text-blue-300'}`}>
            {formatCurrency(calculatedMonthlyAmount, displayCurrency)}
          </div>
          <div className={`text-[10px] mt-0.5 ${hasExistingEntry ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'}`}>
            📅 Berechnet
            {hasExistingEntry && <span className="block">⚠️ Überschreibt</span>}
          </div>
        </div>
      </td>
    )
  }

  // For CUSTOM mode: first month is editable, others show calculated amount
  if (category.input_mode === 'CUSTOM' && category.custom_months) {
    // Show empty for months that are not payment months
    if (!isPaymentMonth) {
      return (
        <td
          className="px-3 py-3 text-center text-sm border bg-gray-50 dark:bg-gray-800/50"
          title={`Keine Zahlung in diesem Monat (Zahlungen in Monaten: ${paymentMonths.join(', ')})`}
        >
          <div>
            <div className="font-semibold text-xs text-gray-400 dark:text-gray-600">
              -
            </div>
            <div className="text-[10px] mt-0.5 text-gray-400 dark:text-gray-600">
              -
            </div>
          </div>
        </td>
      )
    }

    // First month is editable in CUSTOM mode
    if (month === 1) {
      const hasExistingEntry = entry && (entry.planned_amount !== '0' || entry.actual_amount)
      
      // If yearly_amount is set, show calculated amount but make it editable
      if (calculatedMonthlyAmount > 0 && !hasExistingEntry) {
        return (
          <td
            onClick={() => setIsEditing(true)}
            className="px-3 py-3 text-center text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border bg-blue-50 dark:bg-blue-900/10"
            title="Klicken zum Bearbeiten - Gesamtbetrag wird auf alle Monate verteilt"
          >
            <div>
              <div className="font-semibold text-xs text-blue-700 dark:text-blue-300">
                {formatCurrency(calculatedMonthlyAmount, displayCurrency)}
              </div>
              <div className="text-[10px] mt-0.5 text-blue-600 dark:text-blue-400">
                📊 Berechnet (klickbar)
              </div>
            </div>
          </td>
        )
      }

      // Show editable cell for first month
      return (
        <td
          onClick={() => setIsEditing(true)}
          className={`px-3 py-3 text-center text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border ${getStatusColor()}`}
          title="Klicken zum Bearbeiten - Gesamtbetrag wird auf alle Monate verteilt"
        >
          {entry ? (
            <div>
              <div className="font-semibold text-xs text-gray-900 dark:text-white">
                {formatCurrency(parseFloat(entry.actual_amount || entry.planned_amount), displayCurrency)}
              </div>
              {entry.actual_amount && (
                <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Plan: {formatCurrency(parseFloat(entry.planned_amount), displayCurrency)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 dark:text-gray-600 text-sm">-</div>
          )}
        </td>
      )
    }

    // Other payment months (not month 1) show calculated amount
    if (month !== 1 && isPaymentMonth) {
      // If yearly_amount is set, show calculated amount (which is the payment amount)
      if (calculatedMonthlyAmount > 0) {
        const hasExistingEntry = entry && (entry.planned_amount !== '0' || entry.actual_amount)

        return (
          <td
            className={`px-3 py-3 text-center text-sm border ${hasExistingEntry ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-blue-50 dark:bg-blue-900/10'}`}
            title={`Berechnet: Zahlung in diesem Monat${hasExistingEntry ? ' (überschreibt vorhandenen Eintrag)' : ''}`}
          >
            <div>
              <div className={`font-semibold text-xs ${hasExistingEntry ? 'text-yellow-700 dark:text-yellow-300' : 'text-blue-700 dark:text-blue-300'}`}>
                {formatCurrency(calculatedMonthlyAmount, displayCurrency)}
              </div>
              <div className={`text-[10px] mt-0.5 ${hasExistingEntry ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'}`}>
                📊 Berechnet
                {hasExistingEntry && <span className="block">⚠️ Überschreibt</span>}
              </div>
            </div>
          </td>
        )
      }
      
      // If yearly_amount not set yet, show empty (waiting for first month input)
      return (
        <td
          className="px-3 py-3 text-center text-sm border bg-gray-50 dark:bg-gray-800/50"
          title="Warten auf Eingabe im ersten Monat"
        >
          <div>
            <div className="font-semibold text-xs text-gray-400 dark:text-gray-600">
              -
            </div>
            <div className="text-[10px] mt-0.5 text-gray-400 dark:text-gray-600">
              -
            </div>
          </div>
        </td>
      )
    }
  }

  // For MONTHLY mode, use normal editable cell
  return (
    <td
      onClick={() => setIsEditing(true)}
      className={`px-3 py-3 text-center text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border ${getStatusColor()}`}
      title="Klicken zum Bearbeiten"
    >
      {entry ? (
        <div>
          <div className="font-semibold text-xs text-gray-900 dark:text-white">
            {formatCurrency(parseFloat(entry.actual_amount || entry.planned_amount), displayCurrency)}
          </div>
          {entry.actual_amount && (
            <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
              Plan: {formatCurrency(parseFloat(entry.planned_amount), displayCurrency)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-400 dark:text-gray-600 text-sm">-</div>
      )}
    </td>
  )
}

export default MonthlyCell
