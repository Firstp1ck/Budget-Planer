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
}

function TaxesSection({
  budgetId,
  taxEntries,
  categories,
  entries,
  displayMonths,
  displayCurrency,
  budgetYear,
}: TaxesSectionProps) {
  const queryClient = useQueryClient()
  const [isCollapsed, setIsCollapsed] = useState(false)
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
      setIsAddingTax(false)
      setTaxFormData({ name: '', percentage: '' })
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
      setEditingTaxId(null)
      setTaxFormData({ name: '', percentage: '' })
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

    const data = {
      budget: budgetId,
      name: taxFormData.name.trim(),
      percentage: percentage.toFixed(2),
      order: taxEntries.length,
      is_active: true,
    }

    if (editingTaxId) {
      updateTaxMutation.mutate({ id: editingTaxId, data })
    } else {
      createTaxMutation.mutate(data)
    }
  }

  const handleEditTax = (tax: TaxEntry) => {
    setEditingTaxId(tax.id)
    setTaxFormData({ name: tax.name, percentage: tax.percentage })
    setIsAddingTax(true)
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
        className="bg-red-100 dark:bg-red-900/30 border-t-4 border-red-400 dark:border-red-600 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <td
          colSpan={displayMonths.length + 4}
          className="px-4 py-3 text-sm font-bold text-red-800 dark:text-red-300"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{isCollapsed ? '▶' : '▼'}</span>
            <span>💰 Steuern</span>
            <span className="text-xs font-normal opacity-75">({taxEntries.length})</span>
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
              className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="truncate">{tax.name}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    <button
                      onClick={() => handleEditTax(tax)}
                      className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Steuer bearbeiten"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteTax(tax.id, tax.name)}
                      disabled={deleteTaxMutation.isPending}
                      className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 text-xs disabled:opacity-50"
                      title="Steuer löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-center">
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
                    className="px-3 py-3 text-center text-sm border bg-red-50 dark:bg-red-900/10"
                    title={`Berechnet: ${formatCurrency(salary, displayCurrency)} × ${tax.percentage}% = ${formatCurrency(taxAmount, displayCurrency)}`}
                  >
                    <div>
                      <div className="font-semibold text-xs text-red-700 dark:text-red-300">
                        {formatCurrency(taxAmount, displayCurrency)}
                      </div>
                      <div className="text-[10px] mt-0.5 text-red-600 dark:text-red-400">
                        📊 Berechnet
                      </div>
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-3 text-center text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50">
                {formatCurrency(
                  displayMonths.reduce((sum, month) => sum + calculateTaxAmount(tax, month), 0),
                  displayCurrency
                )}
              </td>
              <td className="px-3 py-3 text-center">
                <button
                  onClick={() => handleDeleteTax(tax.id, tax.name)}
                  disabled={deleteTaxMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 text-xs disabled:opacity-50"
                  title="Steuer löschen"
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
          {/* Add Tax Form */}
          {isAddingTax && (
            <tr className="bg-blue-50 dark:bg-blue-900/20">
              <td colSpan={displayMonths.length + 4} className="px-4 py-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={taxFormData.name}
                      onChange={(e) => setTaxFormData({ ...taxFormData, name: e.target.value })}
                      placeholder="Steuername (z.B. Einkommenssteuer, AHV)"
                      className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={taxFormData.percentage}
                        onChange={(e) => setTaxFormData({ ...taxFormData, percentage: e.target.value })}
                        placeholder="Prozentsatz (z.B. 10.5)"
                        className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">%</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveTax}
                      disabled={createTaxMutation.isPending || updateTaxMutation.isPending}
                      className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium disabled:opacity-50 shadow-md hover:shadow-lg text-sm"
                    >
                      {(createTaxMutation.isPending || updateTaxMutation.isPending) ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Speichern...
                        </span>
                      ) : (
                        '✓ Speichern'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingTax(false)
                        setEditingTaxId(null)
                        setTaxFormData({ name: '', percentage: '' })
                      }}
                      disabled={createTaxMutation.isPending || updateTaxMutation.isPending}
                      className="px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm text-sm"
                    >
                      ✕ Abbrechen
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
          {/* Add Tax Button */}
          {!isAddingTax && (
            <tr>
              <td colSpan={displayMonths.length + 4} className="px-4 py-3">
                <button
                  onClick={() => setIsAddingTax(true)}
                  className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2 text-sm"
                >
                  <span className="text-xl">+</span>
                  Steuer hinzufügen
                </button>
              </td>
            </tr>
          )}
        </>
      )}
    </>
  )
}

export default TaxesSection
