import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { taxApi } from '../services/api'
import type { TaxEntry, BudgetCategory, BudgetEntry } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface TaxesSectionProps {
  budgetId: number
  taxEntries: TaxEntry[]
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  displayMonths: number[]
  displayCurrency: Currency
  budgetYear: number
  isCollapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
}

function TaxesSection({
  budgetId,
  taxEntries,
  categories,
  entries,
  displayMonths,
  displayCurrency,
  budgetYear,
  isCollapsed: externalIsCollapsed,
  onCollapseChange,
}: TaxesSectionProps) {
  const queryClient = useQueryClient()
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false)
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed
  
  const setIsCollapsed = (value: boolean) => {
    if (onCollapseChange) {
      onCollapseChange(value)
    } else {
      setInternalIsCollapsed(value)
    }
  }
  const [isAddingTax, setIsAddingTax] = useState(false)
  const [editingTaxId, setEditingTaxId] = useState<number | null>(null)
  const [taxFormData, setTaxFormData] = useState({ name: '', percentage: '' })

  // Find salary category (Gehalt)
  const salaryCategory = categories.find(
    (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
  )

  // Get salary amount for a specific month
  const getSalaryForMonth = (month: number): number => {
    if (!salaryCategory) return 0

    const salaryEntry = entries.find(
      (e) => e.category === salaryCategory.id && e.month === month
    )

    if (salaryEntry) {
      return parseFloat(salaryEntry.actual_amount || salaryEntry.planned_amount)
    }

    // Check if salary category has yearly/custom mode
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
        // For CUSTOM mode, yearly_amount stores the payment amount, not the total
        return parseFloat(salaryCategory.yearly_amount)
      }
    }

    return 0
  }

  // Calculate tax amount for a tax entry in a specific month
  const calculateTaxAmount = (tax: TaxEntry, month: number): number => {
    const salary = getSalaryForMonth(month)
    if (salary === 0) return 0
    return (salary * parseFloat(tax.percentage)) / 100
  }

  const createTaxMutation = useMutation({
    mutationFn: (data: Partial<TaxEntry>) => taxApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      handleCancelEdit()
      toast.success('Steuer hinzugefügt')
    },
    onError: () => {
      toast.error('Fehler beim Hinzufügen der Steuer')
    },
  })

  const updateTaxMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaxEntry> }) =>
      taxApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      handleCancelEdit()
      toast.success('Steuer aktualisiert')
    },
    onError: () => {
      toast.error('Fehler beim Aktualisieren der Steuer')
    },
  })

  const deleteTaxMutation = useMutation({
    mutationFn: (id: number) => taxApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success('Steuer gelöscht')
    },
    onError: () => {
      toast.error('Fehler beim Löschen der Steuer')
    },
  })

  const handleSaveTax = () => {
    if (!taxFormData.name.trim() || !taxFormData.percentage) {
      toast.error('Bitte geben Sie Name und Prozentsatz ein')
      return
    }

    const percentage = parseFloat(taxFormData.percentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('Prozentsatz muss zwischen 0 und 100 liegen')
      return
    }

    if (editingTaxId) {
      // When editing, only update name and percentage, keep existing order and other fields
      const data = {
        name: taxFormData.name.trim(),
        percentage: percentage.toFixed(2),
      }
      updateTaxMutation.mutate({ id: editingTaxId, data })
    } else {
      // When creating, include all required fields
      const data = {
        budget: budgetId,
        name: taxFormData.name.trim(),
        percentage: percentage.toFixed(2),
        order: taxEntries.length,
        is_active: true,
      }
      createTaxMutation.mutate(data)
    }
  }

  const handleUpdateTax = () => {
    handleSaveTax()
  }

  const handleEditTax = (tax: TaxEntry) => {
    setEditingTaxId(tax.id)
    setTaxFormData({ name: tax.name, percentage: tax.percentage })
  }

  const handleCancelEdit = () => {
    setEditingTaxId(null)
    setIsAddingTax(false)
    setTaxFormData({ name: '', percentage: '' })
  }

  const handleDeleteTax = (id: number, name: string) => {
    if (window.confirm(`Steuer "${name}" wirklich löschen?`)) {
      deleteTaxMutation.mutate(id)
    }
  }


  const sortedTaxEntries = [...taxEntries].sort((a, b) => a.order - b.order)

  return (
    <>
      <tr
        className="bg-red-100 dark:bg-red-900/30 border-t-4 border-red-400 dark:border-red-600"
      >
        <td
          colSpan={displayMonths.length + 4}
          className="px-4 py-2 text-sm font-bold text-red-800 dark:text-red-300"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-red-300 dark:border-red-600"
              title={isCollapsed ? 'Aufklappen' : 'Zuklappen'}
              aria-label={isCollapsed ? 'Aufklappen' : 'Zuklappen'}
            >
              <span className={`text-sm transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-90'}`}>
                ▶
              </span>
            </button>
            <span>💰 Steuern</span>
            <span className="text-xs font-normal opacity-75">({taxEntries.length})</span>
            {!isAddingTax && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsAddingTax(true)
                }}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                + Steuer hinzufügen
              </button>
            )}
            {!salaryCategory && (
              <span className="text-xs font-normal text-orange-600 dark:text-orange-400">
                ⚠️ Keine Gehalt-Kategorie gefunden
              </span>
            )}
          </div>
        </td>
      </tr>
      {!isCollapsed && (
        <>
          {sortedTaxEntries.map((tax) => (
            <tr
              key={tax.id}
              className="group bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
            >
              {editingTaxId === tax.id ? (
                <>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={taxFormData.name}
                      onChange={(e) => setTaxFormData({ ...taxFormData, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleUpdateTax()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelEdit()
                        }
                      }}
                      className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Name"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={taxFormData.percentage}
                          onChange={(e) => setTaxFormData({ ...taxFormData, percentage: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleUpdateTax()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              handleCancelEdit()
                            }
                          }}
                          className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          placeholder="Prozent (z.B. 10.5)"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">%</span>
                      </div>
                    </div>
                  </td>
                  {displayMonths.map((month) => {
                    const taxAmount = calculateTaxAmount({ ...tax, percentage: taxFormData.percentage }, month)
                    return (
                      <td
                        key={month}
                        className="px-3 py-2 text-center text-sm border bg-red-50 dark:bg-red-900/10"
                      >
                        <div className="font-semibold text-xs text-red-700 dark:text-red-300">
                          {formatCurrency(taxAmount, displayCurrency)}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateTaxAmount({ ...tax, percentage: taxFormData.percentage }, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUpdateTax()
                        }}
                        disabled={updateTaxMutation.isPending}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-green-500 text-white rounded-md hover:bg-green-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Speichern"
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancelEdit()
                        }}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-500 text-white rounded-md hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                        title="Abbrechen"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-red-50 dark:bg-red-900/10 border-r border-gray-200 dark:border-gray-700 group-hover:bg-red-100 dark:group-hover:bg-red-900/20">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{tax.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                      {tax.percentage}%
                    </span>
                  </td>
                  {displayMonths.map((month) => {
                    const taxAmount = calculateTaxAmount(tax, month)
                    const salary = getSalaryForMonth(month)
                    return (
                      <td
                        key={month}
                        className="px-3 py-2 text-center text-sm border bg-red-50 dark:bg-red-900/10"
                        title={`Berechnet: ${formatCurrency(salary, displayCurrency)} × ${tax.percentage}% = ${formatCurrency(taxAmount, displayCurrency)}`}
                      >
                        <div className="font-semibold text-xs text-red-700 dark:text-red-300">
                          {formatCurrency(taxAmount, displayCurrency)}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateTaxAmount(tax, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditTax(tax)
                        }}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                        title="Steuer bearbeiten"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTax(tax.id, tax.name)
                        }}
                        disabled={deleteTaxMutation.isPending}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Steuer löschen"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {/* Total Row */}
          {sortedTaxEntries.length > 0 && (
            <tr className="bg-red-100 dark:bg-red-900/30 border-t-2 border-red-400 dark:border-red-600 font-bold">
              <td className="px-4 py-2 text-sm font-bold text-red-800 dark:text-red-300 sticky left-0 bg-red-100 dark:bg-red-900/30 border-r border-red-400 dark:border-red-600">
                Gesamt
              </td>
              <td className="px-3 py-2 text-center">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-200 dark:bg-red-800/50 text-red-900 dark:text-red-200">
                  {sortedTaxEntries
                    .filter(t => t.is_active)
                    .reduce((sum, tax) => sum + parseFloat(tax.percentage), 0)
                    .toFixed(2)}%
                </span>
              </td>
              {displayMonths.map((month) => {
                const totalTaxAmount = sortedTaxEntries
                  .filter(t => t.is_active)
                  .reduce((sum, tax) => sum + calculateTaxAmount(tax, month), 0)
                return (
                  <td
                    key={month}
                    className="px-3 py-2 text-center text-sm border bg-red-100 dark:bg-red-900/30"
                  >
                    <div className="font-bold text-red-800 dark:text-red-200">
                      {formatCurrency(totalTaxAmount, displayCurrency)}
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/30">
                {formatCurrency(
                  displayMonths.reduce((sum, month) => {
                    return sum + sortedTaxEntries
                      .filter(t => t.is_active)
                      .reduce((taxSum, tax) => taxSum + calculateTaxAmount(tax, month), 0)
                  }, 0),
                  displayCurrency
                )}
              </td>
              <td className="px-3 py-2 text-center">
                {/* Empty cell for alignment */}
              </td>
            </tr>
          )}
          {isAddingTax && (
            <tr className="bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800">
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={taxFormData.name}
                  onChange={(e) => setTaxFormData({ ...taxFormData, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveTax()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      handleCancelEdit()
                    }
                  }}
                  className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Name (z.B. Einkommenssteuer, AHV)"
                />
              </td>
              <td className="px-4 py-2 text-center">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxFormData.percentage}
                      onChange={(e) => setTaxFormData({ ...taxFormData, percentage: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveTax()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelEdit()
                        }
                      }}
                      className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Prozent (z.B. 10.5)"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">%</span>
                  </div>
                </div>
              </td>
              {displayMonths.map((month) => (
                <td key={month} className="px-3 py-2 text-center text-sm text-gray-400 dark:text-gray-500">
                  -
                </td>
              ))}
              <td className="px-3 py-2 text-center text-sm text-gray-400 dark:text-gray-500">
                -
              </td>
              <td className="px-4 py-2 text-center">
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSaveTax()
                    }}
                    disabled={createTaxMutation.isPending}
                    className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-green-500 text-white rounded-md hover:bg-green-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Speichern"
                  >
                    ✓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCancelEdit()
                    }}
                    className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-500 text-white rounded-md hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                    title="Abbrechen"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          )}
          {!isAddingTax && (
            <tr className="bg-red-100 dark:bg-red-900/30 border-t-2 border-red-400 dark:border-red-600 font-bold">
              <td className="px-4 py-2 text-sm font-bold text-red-800 dark:text-red-300 sticky left-0 bg-red-100 dark:bg-red-900/30 border-r border-red-400 dark:border-red-600">
                Gesamt
              </td>
              <td className="px-3 py-2 text-center">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-200 dark:bg-red-800/50 text-red-900 dark:text-red-200">
                  {sortedTaxEntries
                    .filter(t => t.is_active)
                    .reduce((sum, tax) => sum + parseFloat(tax.percentage), 0)
                    .toFixed(2)}%
                </span>
              </td>
              {displayMonths.map((month) => (
                <td key={month} className="px-3 py-2 text-center text-sm border bg-red-100 dark:bg-red-900/30">
                  <div className="font-bold text-red-800 dark:text-red-200">
                    {formatCurrency(
                      sortedTaxEntries
                        .filter(t => t.is_active)
                        .reduce((sum, tax) => sum + calculateTaxAmount(tax, month), 0),
                      displayCurrency
                    )}
                  </div>
                </td>
              ))}
              <td className="px-3 py-2 text-center text-sm font-bold text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/30">
                {formatCurrency(
                  displayMonths.reduce((sum, month) => {
                    return sum + sortedTaxEntries
                      .filter(t => t.is_active)
                      .reduce((taxSum, tax) => taxSum + calculateTaxAmount(tax, month), 0)
                  }, 0),
                  displayCurrency
                )}
              </td>
              <td className="px-4 py-2 text-center">
              </td>
            </tr>
          )}
        </>
      )}
    </>
  )
}

export default TaxesSection
