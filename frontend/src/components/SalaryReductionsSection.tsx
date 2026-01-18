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
}

function SalaryReductionsSection({
  budgetId,
  salaryReductions,
  categories,
  entries,
  displayMonths,
  displayCurrency,
  budgetYear,
}: SalaryReductionsSectionProps) {
  const queryClient = useQueryClient()
  const [isCollapsed, setIsCollapsed] = useState(false)
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
      const monthsInterval = 12 / salaryCategory.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < salaryCategory.custom_months; i++) {
        const calculatedMonth = 1 + (i * monthsInterval)
        let paymentMonth = Math.round(calculatedMonth)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }

      if (paymentMonths.includes(month)) {
        return parseFloat(salaryCategory.yearly_amount) / salaryCategory.custom_months
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

  if (!salaryCategory) {
    return (
      <tr className="bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-yellow-300 dark:border-yellow-600">
        <td colSpan={displayMonths.length + 4} className="px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          ⚠️ Keine "Gehalt" Kategorie gefunden. Bitte erstellen Sie eine Einnahmen-Kategorie mit dem Namen "Gehalt".
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr
        className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-t-2 border-orange-300 dark:border-orange-600 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <td colSpan={displayMonths.length + 4} className="px-4 py-3 text-sm font-bold">
          <div className="flex items-center gap-2">
            <span className="text-sm">{isCollapsed ? '▶' : '▼'}</span>
            <span>💰 Gehaltsabzüge (Brutto → Netto)</span>
            <span className="text-xs font-normal opacity-75">({salaryReductions.length})</span>
          </div>
        </td>
      </tr>
      {!isCollapsed && (
        <>
          {sortedReductions.map((reduction) => (
            <tr key={reduction.id} className="bg-orange-50 dark:bg-orange-900/10 border-b border-orange-200 dark:border-orange-800">
              {editingReductionId === reduction.id ? (
                <>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={reductionFormData.name}
                      onChange={(e) => setReductionFormData({ ...reductionFormData, name: e.target.value })}
                      className="px-4 py-3 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Name"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={reductionFormData.reduction_type}
                      onChange={(e) => setReductionFormData({ ...reductionFormData, reduction_type: e.target.value as ReductionType })}
                      className="px-4 py-3 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="PERCENTAGE">Prozent</option>
                      <option value="FIXED">Fixbetrag</option>
                    </select>
                  </td>
                  {displayMonths.map((month) => (
                    <td key={month} className="px-3 py-3 text-center text-sm text-gray-900 dark:text-white">
                      {formatCurrency(calculateReductionAmount({ ...reduction, ...reductionFormData }, month), displayCurrency)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateReductionAmount({ ...reduction, ...reductionFormData }, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={handleUpdateReduction}
                        disabled={updateReductionMutation.isPending}
                        className="px-5 py-3 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 text-sm"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-5 py-3 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{reduction.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-3 py-1 rounded-full text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200">
                      {reduction.reduction_type === 'PERCENTAGE' ? `${reduction.value}%` : formatCurrency(parseFloat(reduction.value), displayCurrency)}
                    </span>
                  </td>
                  {displayMonths.map((month) => (
                    <td key={month} className="px-3 py-3 text-center text-sm text-gray-900 dark:text-white">
                      {formatCurrency(calculateReductionAmount(reduction, month), displayCurrency)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(
                      displayMonths.reduce((sum, month) => sum + calculateReductionAmount(reduction, month), 0),
                      displayCurrency
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEditReduction(reduction)}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 text-xs"
                        title="Bearbeiten"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteReduction(reduction.id, reduction.name)}
                        disabled={deleteReductionMutation.isPending}
                        className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-xs disabled:opacity-50"
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
            <tr className="bg-orange-50 dark:bg-orange-900/10 border-b border-orange-200 dark:border-orange-800">
              <td className="px-4 py-3">
                <input
                  type="text"
                  value={reductionFormData.name}
                  onChange={(e) => setReductionFormData({ ...reductionFormData, name: e.target.value })}
                  className="px-4 py-3 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Name (z.B. AHV, Krankenkasse)"
                />
              </td>
              <td className="px-4 py-3 text-center">
                <div className="space-y-2">
                  <select
                    value={reductionFormData.reduction_type}
                    onChange={(e) => setReductionFormData({ ...reductionFormData, reduction_type: e.target.value as ReductionType })}
                    className="px-4 py-3 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="PERCENTAGE">Prozent</option>
                    <option value="FIXED">Fixbetrag</option>
                  </select>
                  <input
                    type="number"
                    step={reductionFormData.reduction_type === 'PERCENTAGE' ? '0.01' : '0.01'}
                    value={reductionFormData.value}
                    onChange={(e) => setReductionFormData({ ...reductionFormData, value: e.target.value })}
                    className="px-4 py-3 w-full border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder={reductionFormData.reduction_type === 'PERCENTAGE' ? 'Prozent (z.B. 5.125)' : 'Betrag'}
                  />
                </div>
              </td>
              {displayMonths.map((month) => (
                <td key={month} className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">
                  -
                </td>
              ))}
              <td className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">
                -
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleAddReduction}
                    disabled={createReductionMutation.isPending}
                    className="px-5 py-3 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 text-sm"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-5 py-3 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          )}
          {!isAddingReduction && (
            <tr className="bg-orange-50 dark:bg-orange-900/10 border-b border-orange-200 dark:border-orange-800">
              <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">
                <button
                  onClick={() => setIsAddingReduction(true)}
                  className="px-5 py-3 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
                >
                  + Abzug hinzufügen
                </button>
              </td>
              {displayMonths.map((month) => (
                <td key={month} className="px-3 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                  {formatCurrency(getTotalReductionsForMonth(month), displayCurrency)}
                </td>
              ))}
              <td className="px-3 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                {formatCurrency(
                  displayMonths.reduce((sum, month) => sum + getTotalReductionsForMonth(month), 0),
                  displayCurrency
                )}
              </td>
              <td className="px-4 py-3 text-center text-gray-900 dark:text-white">
                -
              </td>
            </tr>
          )}
          <tr className="bg-green-50 dark:bg-green-900/20 border-b-2 border-green-300 dark:border-green-600">
            <td colSpan={2} className="px-4 py-3 text-sm font-bold text-green-800 dark:text-green-300">
              Netto-Gehalt (Brutto - Abzüge)
            </td>
            {displayMonths.map((month) => (
              <td key={month} className="px-3 py-3 text-center text-sm font-bold text-green-800 dark:text-green-300">
                {formatCurrency(getNetSalaryForMonth(month), displayCurrency)}
              </td>
            ))}
            <td className="px-3 py-3 text-center text-sm font-bold text-green-800 dark:text-green-300">
              {formatCurrency(
                displayMonths.reduce((sum, month) => sum + getNetSalaryForMonth(month), 0),
                displayCurrency
              )}
            </td>
            <td className="px-4 py-3 text-center">
              -
            </td>
          </tr>
        </>
      )}
    </>
  )
}

export default SalaryReductionsSection
