import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { salaryReductionApi } from '../services/api'
import type { SalaryReduction, BudgetCategory, BudgetEntry, ReductionType } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'

interface SalaryReductionsSectionProps {
  budgetId: number
  salaryReductions: SalaryReduction[]
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  displayMonths: number[]
  displayCurrency: Currency
  budgetYear: number
  isCollapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
}

function SalaryReductionsSection({
  budgetId,
  salaryReductions,
  categories,
  entries,
  displayMonths,
  displayCurrency,
  budgetYear,
  isCollapsed: externalIsCollapsed,
  onCollapseChange,
}: SalaryReductionsSectionProps) {
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
  const [isAddingReduction, setIsAddingReduction] = useState(false)
  const [editingReductionId, setEditingReductionId] = useState<number | null>(null)
  const [reductionFormData, setReductionFormData] = useState({
    name: '',
    reduction_type: 'PERCENTAGE' as ReductionType,
    value: '',
  })

  // Find salary category (Gehalt)
  const salaryCategory = categories.find(
    (c) => c.category_type === 'INCOME' && c.name.toLowerCase().includes('gehalt')
  )

  // Get gross salary amount for a specific month
  const getGrossSalaryForMonth = (month: number): number => {
    if (!salaryCategory) return 0

    // Prioritize input mode over entries
    // If YEARLY mode, always use yearly_amount / 12
    if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
      return parseFloat(salaryCategory.yearly_amount) / 12
    }

    // If CUSTOM mode, check if this month is a payment month
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
      } else {
        return 0
      }
    }

    // For MONTHLY mode, check for entry
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

  // Calculate reduction amount for a reduction entry in a specific month
  const calculateReductionAmount = (reduction: SalaryReduction, month: number): number => {
    if (!reduction.is_active) return 0
    
    const grossSalary = getGrossSalaryForMonth(month)
    if (grossSalary === 0) return 0

    if (reduction.reduction_type === 'PERCENTAGE') {
      return (grossSalary * parseFloat(reduction.value)) / 100
    } else {
      return parseFloat(reduction.value)
    }
  }

  // Calculate total reductions for a month
  const getTotalReductionsForMonth = (month: number): number => {
    return salaryReductions.reduce((sum, reduction) => {
      return sum + calculateReductionAmount(reduction, month)
    }, 0)
  }

  // Calculate net salary (gross - reductions) for a month
  const getNetSalaryForMonth = (month: number): number => {
    const gross = getGrossSalaryForMonth(month)
    const reductions = getTotalReductionsForMonth(month)
    return Math.max(0, gross - reductions)
  }

  const createReductionMutation = useMutation({
    mutationFn: (data: Partial<SalaryReduction>) => salaryReductionApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success('Abzug hinzugefügt')
      setIsAddingReduction(false)
      setReductionFormData({ name: '', reduction_type: 'PERCENTAGE', value: '' })
    },
    onError: () => {
      toast.error('Fehler beim Hinzufügen des Abzugs')
    },
  })

  const updateReductionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SalaryReduction> }) =>
      salaryReductionApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success('Abzug aktualisiert')
      setEditingReductionId(null)
      setReductionFormData({ name: '', reduction_type: 'PERCENTAGE', value: '' })
    },
    onError: () => {
      toast.error('Fehler beim Aktualisieren des Abzugs')
    },
  })

  const deleteReductionMutation = useMutation({
    mutationFn: (id: number) => salaryReductionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success('Abzug gelöscht')
    },
    onError: () => {
      toast.error('Fehler beim Löschen des Abzugs')
    },
  })

  const handleAddReduction = () => {
    if (!reductionFormData.name || !reductionFormData.value) {
      toast.error('Bitte alle Felder ausfüllen')
      return
    }

    const value = parseFloat(reductionFormData.value)
    if (isNaN(value) || value < 0) {
      toast.error('Ungültiger Wert')
      return
    }

    if (reductionFormData.reduction_type === 'PERCENTAGE' && value > 100) {
      toast.error('Prozentsatz darf nicht über 100% liegen')
      return
    }

    createReductionMutation.mutate({
      budget: budgetId,
      name: reductionFormData.name,
      reduction_type: reductionFormData.reduction_type,
      value: reductionFormData.value,
      order: salaryReductions.length,
      is_active: true,
    })
  }

  const handleEditReduction = (reduction: SalaryReduction) => {
    setEditingReductionId(reduction.id)
    setReductionFormData({
      name: reduction.name,
      reduction_type: reduction.reduction_type,
      value: reduction.value,
    })
  }

  const handleUpdateReduction = () => {
    if (!reductionFormData.name || !reductionFormData.value) {
      toast.error('Bitte alle Felder ausfüllen')
      return
    }

    const value = parseFloat(reductionFormData.value)
    if (isNaN(value) || value < 0) {
      toast.error('Ungültiger Wert')
      return
    }

    if (reductionFormData.reduction_type === 'PERCENTAGE' && value > 100) {
      toast.error('Prozentsatz darf nicht über 100% liegen')
      return
    }

    if (editingReductionId) {
      updateReductionMutation.mutate({
        id: editingReductionId,
        data: {
          name: reductionFormData.name,
          reduction_type: reductionFormData.reduction_type,
          value: reductionFormData.value,
        },
      })
    }
  }

  const handleDeleteReduction = (id: number, name: string) => {
    if (confirm(`Möchten Sie den Abzug "${name}" wirklich löschen?`)) {
      deleteReductionMutation.mutate(id)
    }
  }

  const handleCancelEdit = () => {
    setEditingReductionId(null)
    setIsAddingReduction(false)
    setReductionFormData({ name: '', reduction_type: 'PERCENTAGE', value: '' })
  }

  const sortedReductions = [...salaryReductions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.name.localeCompare(b.name)
  })

  // Calculate total reductions across all months
  const calculateTotalReductions = (): number => {
    return displayMonths.reduce((sum, month) => sum + getTotalReductionsForMonth(month), 0)
  }

  if (!salaryCategory) {
    return (
      <tr className="bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-yellow-300 dark:border-yellow-600">
        <td colSpan={displayMonths.length + 4} className="px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          ⚠️ Keine "Gehalt" Kategorie gefunden. Bitte erstellen Sie eine Einnahmen-Kategorie mit dem Namen "Gehalt".
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr
        className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-t-2 border-gray-300 dark:border-gray-600"
      >
        {isCollapsed ? (
          <>
            {/* When collapsed, show individual cells with total in Gesamt column */}
            <td className="px-4 py-2 text-sm font-bold text-orange-800 dark:text-orange-300 sticky left-0 bg-orange-100 dark:bg-orange-900/30 border-r border-gray-300 dark:border-gray-600">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-gray-300 dark:border-gray-600"
                  title="Aufklappen"
                  aria-label="Aufklappen"
                >
                  <span className="text-sm transition-transform duration-200 rotate-0">
                    ▶
                  </span>
                </button>
                <span>💰 Gehaltsabzüge (Brutto → Netto)</span>
                <span className="text-xs font-normal opacity-75">({salaryReductions.length})</span>
              </div>
            </td>
            <td className="px-3 py-2 text-center">
              {/* Empty cell for type column */}
            </td>
            {displayMonths.map((month) => (
              <td key={month} className="px-3 py-2 text-center">
                {/* Empty cells for month columns */}
              </td>
            ))}
            <td className="px-3 py-2 text-center text-sm font-bold text-orange-800 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30">
              {formatCurrency(calculateTotalReductions(), displayCurrency)}
            </td>
            <td className="px-3 py-2 text-center">
              {/* Empty cell for actions column */}
            </td>
          </>
        ) : (
          <td colSpan={displayMonths.length + 4} className="px-4 py-2 text-sm font-bold">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-gray-300 dark:border-gray-600"
                title="Zuklappen"
                aria-label="Zuklappen"
              >
                <span className="text-sm transition-transform duration-200 rotate-90">
                  ▶
                </span>
              </button>
              <span>💰 Gehaltsabzüge (Brutto → Netto)</span>
              <span className="text-xs font-normal opacity-75">({salaryReductions.length})</span>
              {!isAddingReduction && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddingReduction(true)
                  }}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
                >
                  + Abzug hinzufügen
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {!isCollapsed && (
        <>
          {sortedReductions.map((reduction) => (
            <tr key={reduction.id} className="group bg-orange-50 dark:bg-orange-900/10 border-b border-gray-200 dark:border-gray-700 hover:bg-orange-100 dark:hover:bg-orange-900/20 transition-colors">
              {editingReductionId === reduction.id ? (
                <>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={reductionFormData.name}
                      onChange={(e) => setReductionFormData({ ...reductionFormData, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleUpdateReduction()
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
                      <select
                        value={reductionFormData.reduction_type}
                        onChange={(e) => setReductionFormData({ ...reductionFormData, reduction_type: e.target.value as ReductionType })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleUpdateReduction()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            handleCancelEdit()
                          }
                        }}
                        className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        <option value="PERCENTAGE">Prozent</option>
                        <option value="FIXED">Fixbetrag</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={reductionFormData.reduction_type === 'PERCENTAGE' ? '100' : undefined}
                        value={reductionFormData.value}
                        onChange={(e) => setReductionFormData({ ...reductionFormData, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleUpdateReduction()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            handleCancelEdit()
                          }
                        }}
                        className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        placeholder={reductionFormData.reduction_type === 'PERCENTAGE' ? 'Prozent (z.B. 5.125)' : 'Betrag'}
                      />
                    </div>
                  </td>
                  {displayMonths.map((month) => (
                    <td key={month} className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
                      {formatCurrency(calculateReductionAmount({ ...reduction, ...reductionFormData }, month), displayCurrency)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateReductionAmount({ ...reduction, ...reductionFormData }, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUpdateReduction()
                        }}
                        disabled={updateReductionMutation.isPending}
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
                  <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{reduction.name}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="px-3 py-1 rounded-full text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200">
                      {reduction.reduction_type === 'PERCENTAGE' ? `${reduction.value}%` : formatCurrency(parseFloat(reduction.value), displayCurrency)}
                    </span>
                  </td>
                  {displayMonths.map((month) => (
                    <td key={month} className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
                      {formatCurrency(calculateReductionAmount(reduction, month), displayCurrency)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateReductionAmount(reduction, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditReduction(reduction)
                        }}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                        title="Bearbeiten"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteReduction(reduction.id, reduction.name)
                        }}
                        disabled={deleteReductionMutation.isPending}
                        className="text-base px-3 py-2 min-w-[36px] min-h-[36px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Löschen"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {isAddingReduction && (
            <tr className="bg-orange-50 dark:bg-orange-900/10 border-b border-gray-200 dark:border-gray-700">
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={reductionFormData.name}
                  onChange={(e) => setReductionFormData({ ...reductionFormData, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReduction()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      handleCancelEdit()
                    }
                  }}
                  className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Name (z.B. AHV, Krankenkasse)"
                />
              </td>
              <td className="px-4 py-2 text-center">
                <div className="space-y-2">
                  <select
                    value={reductionFormData.reduction_type}
                    onChange={(e) => setReductionFormData({ ...reductionFormData, reduction_type: e.target.value as ReductionType })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddReduction()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        handleCancelEdit()
                      }
                    }}
                    className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="PERCENTAGE">Prozent</option>
                    <option value="FIXED">Fixbetrag</option>
                  </select>
                  <input
                    type="number"
                    step={reductionFormData.reduction_type === 'PERCENTAGE' ? '0.01' : '0.01'}
                    value={reductionFormData.value}
                    onChange={(e) => setReductionFormData({ ...reductionFormData, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddReduction()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        handleCancelEdit()
                      }
                    }}
                    className="px-4 py-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder={reductionFormData.reduction_type === 'PERCENTAGE' ? 'Prozent (z.B. 5.125)' : 'Betrag'}
                  />
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
                      handleAddReduction()
                    }}
                    disabled={createReductionMutation.isPending}
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
          {!isAddingReduction && (
            <tr className="bg-orange-100 dark:bg-orange-900/30 border-b-2 border-orange-300 dark:border-orange-600 font-bold">
              <td className="px-4 py-2 text-sm font-bold text-orange-800 dark:text-orange-300 sticky left-0 bg-orange-100 dark:bg-orange-900/30 border-r border-orange-300 dark:border-orange-600">
                Gesamt
              </td>
              <td className="px-3 py-2 text-center border-r border-orange-300 dark:border-orange-600">
                {/* Empty cell for type column */}
              </td>
              {displayMonths.map((month) => (
                <td key={month} className="px-3 py-2 text-center text-sm border-r border-orange-300 dark:border-orange-600 bg-orange-100 dark:bg-orange-900/30">
                  <div className="font-bold text-orange-800 dark:text-orange-200">
                    {formatCurrency(getTotalReductionsForMonth(month), displayCurrency)}
                  </div>
                </td>
              ))}
              <td className="px-3 py-2 text-center text-sm font-bold text-orange-800 dark:text-orange-200 bg-orange-100 dark:bg-orange-900/30 border-r border-orange-300 dark:border-orange-600">
                {formatCurrency(
                  displayMonths.reduce((sum, month) => sum + getTotalReductionsForMonth(month), 0),
                  displayCurrency
                )}
              </td>
              <td className="px-4 py-2 text-center">
              </td>
            </tr>
          )}
          <tr className="bg-green-50 dark:bg-green-900/20 border-b-2 border-green-300 dark:border-green-600">
            <td colSpan={2} className="px-4 py-2 text-sm font-bold text-green-800 dark:text-green-300">
              Netto-Gehalt (Brutto - Abzüge)
            </td>
            {displayMonths.map((month) => (
              <td key={month} className="px-3 py-2 text-center text-sm font-bold text-green-800 dark:text-green-300">
                {formatCurrency(getNetSalaryForMonth(month), displayCurrency)}
              </td>
            ))}
            <td className="px-3 py-2 text-center text-sm font-bold text-green-800 dark:text-green-300">
              {formatCurrency(
                displayMonths.reduce((sum, month) => sum + getNetSalaryForMonth(month), 0),
                displayCurrency
              )}
            </td>
            <td className="px-4 py-2 text-center">
              -
            </td>
          </tr>
        </>
      )}
    </>
  )
}

export default SalaryReductionsSection
