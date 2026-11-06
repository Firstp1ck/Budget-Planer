import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { categoryApi } from '../services/api'
import type { BudgetCategory, BudgetEntry, InputMode, SalaryReduction } from '../types/budget'
import { Currency, formatCurrency } from '../utils/currency'
import MonthlyCell from './MonthlyCell'
import CellEditorDialog from './CellEditorDialog'
import { isSalaryCategory } from '../utils/salary'

interface CategoryRowProps {
  type: string
  categories: BudgetCategory[]
  entries: BudgetEntry[]
  displayMonths: number[]
  getEntryForCategoryAndMonth: (categoryId: number, month: number) => BudgetEntry | undefined
  budgetId: number
  displayCurrency: Currency
  budgetYear?: number
  salaryReductions?: SalaryReduction[]
  isCollapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
  onAddCategory?: (type: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  INCOME: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  FIXED_EXPENSE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  VARIABLE_EXPENSE: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  SAVINGS: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
}

function CategoryRow({
  type,
  categories,
  entries,
  displayMonths,
  getEntryForCategoryAndMonth,
  budgetId,
  displayCurrency,
  budgetYear,
  salaryReductions = [],
  isCollapsed: externalIsCollapsed,
  onCollapseChange,
  onAddCategory,
}: CategoryRowProps) {
  const { t } = useTranslation()
  const year = budgetYear || new Date().getFullYear()
  const queryClient = useQueryClient()
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false)
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed
  
  // Type labels with icons
  const TYPE_LABELS: Record<string, string> = {
    INCOME: `💰 ${t('categoryTypes.INCOME')}`,
    FIXED_EXPENSE: `🏠 ${t('categoryTypes.FIXED_EXPENSE')}`,
    VARIABLE_EXPENSE: `🛒 ${t('categoryTypes.VARIABLE_EXPENSE')}`,
    SAVINGS: `💎 ${t('categoryTypes.SAVINGS')}`,
  }

  // Month names (full names for dropdown)
  const MONTH_FULL_NAMES = [
    t('months.january'), t('months.february'), t('months.march'), t('months.april'),
    t('months.mayFull'), t('months.june'), t('months.july'), t('months.august'),
    t('months.september'), t('months.october'), t('months.november'), t('months.december')
  ]
  
  const setIsCollapsed = (value: boolean) => {
    if (onCollapseChange) {
      onCollapseChange(value)
    } else {
      setInternalIsCollapsed(value)
    }
  }
  const [editingInputMode, setEditingInputMode] = useState<number | null>(null)
  const [editingName, setEditingName] = useState<number | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(null)
  const [inputModeData, setInputModeData] = useState<{
    mode: InputMode
    customMonths: number
    customStartMonth: number
    yearlyAmount: string
    customAmountType: 'payment' | 'total'
  }>({ mode: 'MONTHLY', customMonths: 12, customStartMonth: 1, yearlyAmount: '0', customAmountType: 'payment' })
  const [showAutofillDialog, setShowAutofillDialog] = useState<number | null>(null)
  const [autofillData, setAutofillData] = useState({
    amount: '',
    mode: 'all' as 'all' | 'empty' | 'remaining',
    startMonth: 1,
  })

  const [formError, setFormError] = useState('')
  const [confirmedGlobalChange, setConfirmedGlobalChange] = useState(false)
  const formSubmitting = useRef(false)
  const copySubmitting = useRef(false)

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => categoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      toast.success(t('category.deleted'))
    },
    onError: () => {
      toast.error(t('category.errorDeleting'))
    },
  })

  const reorderCategoryMutation = useMutation({
    mutationFn: ({ id, order }: { id: number; order: number }) => categoryApi.reorder(id, order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
    },
    onError: () => {
      toast.error(t('category.reorderError'))
    },
  })

  const handleDragStart = (e: React.DragEvent, categoryId: number) => {
    setDraggedCategoryId(categoryId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', categoryId.toString())
  }

  const handleDragOver = (e: React.DragEvent, categoryId: number) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (draggedCategoryId && draggedCategoryId !== categoryId) {
      setDragOverCategoryId(categoryId)
    }
  }

  const handleDragLeave = () => {
    setDragOverCategoryId(null)
  }

  const handleDrop = (e: React.DragEvent, targetCategoryId: number) => {
    e.preventDefault()
    setDragOverCategoryId(null)
    
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
      setDraggedCategoryId(null)
      return
    }

    const draggedCategory = categories.find(c => c.id === draggedCategoryId)
    const targetCategory = categories.find(c => c.id === targetCategoryId)
    
    if (!draggedCategory || !targetCategory) {
      setDraggedCategoryId(null)
      return
    }

    // Calculate new order
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order)
    const draggedIndex = sortedCategories.findIndex(c => c.id === draggedCategoryId)
    const targetIndex = sortedCategories.findIndex(c => c.id === targetCategoryId)
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCategoryId(null)
      return
    }
    
    // Remove dragged category from its position
    sortedCategories.splice(draggedIndex, 1)
    
    // Insert at new position (if dragging down, insert after target; if dragging up, insert at target position)
    const newIndex = draggedIndex < targetIndex ? targetIndex : targetIndex
    sortedCategories.splice(newIndex, 0, draggedCategory)
    
    // Update orders for all affected categories
    sortedCategories.forEach((category, index) => {
      const newOrder = index
      const oldOrder = categories.find(c => c.id === category.id)?.order ?? index
      // Only update if order changed
      if (newOrder !== oldOrder) {
        reorderCategoryMutation.mutate({ id: category.id, order: newOrder })
      }
    })
    
    setDraggedCategoryId(null)
  }

  const handleDragEnd = () => {
    setDraggedCategoryId(null)
    setDragOverCategoryId(null)
  }

  const updateInputModeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetCategory> }) =>
      categoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      formSubmitting.current = false
      setEditingInputMode(null)
      toast.success(t('inputMode.inputModeUpdated'))
    },
    onError: () => {
      formSubmitting.current = false
      setFormError(t('inputMode.errorUpdatingInputMode'))
    },
  })

  const updateCategoryNameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      categoryApi.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      formSubmitting.current = false
      setEditingName(null)
      setCategoryName('')
      toast.success(t('category.nameUpdated'))
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.name?.[0] || error.response?.data?.error || t('category.errorUpdatingName')
      formSubmitting.current = false
      setFormError(errorMessage)
    },
  })

  const copyPreviousMonthMutation = useMutation({
    mutationFn: async ({ categoryId, month }: { categoryId: number; month: number }) => {
      const previousEntry = entries.find(e => e.category === categoryId && e.year === year && e.month === month - 1)
      if (!previousEntry) throw new Error(t('entry.noPreviousMonth'))
      return categoryApi.planEntries(categoryId, { year, entries: [{ month, planned_amount: previousEntry.planned_amount }] })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      copySubmitting.current = false
      toast.success(t('gridUX.planCopied'))
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      copySubmitting.current = false
      toast.error(t('entry.errorCopying'))
    },
  })

  const autofillMonthsMutation = useMutation({
    mutationFn: async ({ categoryId, amount, mode, startMonth }: { categoryId: number; amount: string; mode: 'all' | 'empty' | 'remaining'; startMonth: number }) => {
      const categoryEntries = entries.filter(e => e.category === categoryId && e.year === year)
      const plannedEntries = Array.from({ length: 12 }, (_, i) => i + 1).filter(month => {
        const existing = categoryEntries.find(e => e.month === month)
        return mode === 'all' || (mode === 'remaining' && month >= startMonth) || (mode === 'empty' && (!existing || (Number(existing.planned_amount) === 0 && existing.actual_amount == null)))
      }).map(month => ({ month, planned_amount: Number(amount).toFixed(2) }))
      if (!plannedEntries.length) return 0
      await categoryApi.planEntries(categoryId, { year, entries: plannedEntries })
      return plannedEntries.length
    },
    onSuccess: count => {
      formSubmitting.current = false
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setShowAutofillDialog(null)
      toast.success(t('autofill.monthsFilled', { count }))
    },
    onError: () => {
      formSubmitting.current = false
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
      setFormError(t('gridUX.saveError'))
    },
  })

  const handleOpenAutofill = (category: BudgetCategory) => {
    if (formSubmitting.current) return
    setFormError('')
    setEditingInputMode(null)
    setEditingName(null)
    // Try to find an existing entry to suggest amount
    const categoryEntries = entries.filter(e => e.category === category.id && e.year === year)
    const firstEntry = categoryEntries.find(e => parseFloat(e.planned_amount) > 0)

    setAutofillData({
      amount: firstEntry?.planned_amount || '',
      mode: 'empty',
      startMonth: 1,
    })
    setShowAutofillDialog(category.id)
  }

  const handleAutofill = (categoryId: number) => {
    if (formSubmitting.current) return
    if (!autofillData.amount.trim() || !Number.isFinite(Number(autofillData.amount)) || Number(autofillData.amount) < 0 || !Number.isInteger(autofillData.startMonth) || autofillData.startMonth < 1 || autofillData.startMonth > 12) {
      setFormError(t('autofill.enterValidAmount'))
      return
    }

    formSubmitting.current = true
    setFormError('')
    autofillMonthsMutation.mutate({
      categoryId,
      amount: autofillData.amount,
      mode: autofillData.mode,
      startMonth: autofillData.startMonth,
    })
  }

  const handleDeleteCategory = (id: number, name: string) => {
    if (window.confirm(t('category.confirmDelete', { name }))) {
      deleteCategoryMutation.mutate(id)
    }
  }

  const handleEditName = (category: BudgetCategory) => {
    if (formSubmitting.current) return
    setFormError('')
    setEditingInputMode(null)
    setShowAutofillDialog(null)
    setEditingName(category.id)
    setCategoryName(category.name)
  }

  const handleSaveName = (categoryId: number) => {
    if (formSubmitting.current) return
    if (!categoryName.trim()) {
      setFormError(t('category.enterName'))
      return
    }
    formSubmitting.current = true
    setFormError('')
    updateCategoryNameMutation.mutate({ id: categoryId, name: categoryName.trim() })
  }

  const handleCancelEditName = () => {
    if (formSubmitting.current) return
    setEditingName(null)
    setCategoryName('')
  }

  const handleEditInputMode = (category: BudgetCategory) => {
    if (formSubmitting.current) return
    setFormError('')
    setConfirmedGlobalChange(false)
    setEditingName(null)
    setShowAutofillDialog(null)
    setEditingInputMode(category.id)

    // Calculate suggested yearly amount from existing entries
    const categoryEntries = entries.filter((e) => e.category === category.id && e.year === year)
    const totalFromEntries = categoryEntries.reduce((sum, entry) => {
      const amount = parseFloat(entry.planned_amount)
      return sum + amount
    }, 0)

    // Pre-fill yearly amount with existing total or saved value
    const suggestedYearlyAmount = category.yearly_amount ||
      (totalFromEntries > 0 ? totalFromEntries.toString() : '0')

    setInputModeData({
      mode: category.input_mode,
      customMonths: category.custom_months || 12,
      customStartMonth: category.custom_start_month || 1,
      yearlyAmount: suggestedYearlyAmount,
      customAmountType: 'payment', // Default to payment amount (what we store)
    })
  }

  const handleSaveInputMode = (categoryId: number) => {
    if (formSubmitting.current) return
    if (!confirmedGlobalChange) { setFormError(t('gridUX.confirmRequired')); return }
    if (inputModeData.mode !== 'MONTHLY' && (!inputModeData.yearlyAmount.trim() || !Number.isFinite(Number(inputModeData.yearlyAmount)) || Number(inputModeData.yearlyAmount) < 0)) { setFormError(t('validation.enterValidAmount')); return }
    if (inputModeData.mode === 'CUSTOM' && (!Number.isInteger(inputModeData.customMonths) || inputModeData.customMonths < 1 || inputModeData.customMonths > 12 || !Number.isInteger(inputModeData.customStartMonth) || inputModeData.customStartMonth < 1 || inputModeData.customStartMonth > 12)) { setFormError(t('gridUX.invalidSchedule')); return }
    setFormError('')
    let yearlyAmount = inputModeData.yearlyAmount
    
    // If CUSTOM mode and user entered total amount, convert to payment amount
    if (inputModeData.mode === 'CUSTOM' && inputModeData.customAmountType === 'total') {
      const totalAmount = parseFloat(inputModeData.yearlyAmount || '0')
      yearlyAmount = (totalAmount / inputModeData.customMonths).toFixed(2)
    }
    
    const data: Partial<BudgetCategory> = {
      input_mode: inputModeData.mode,
      custom_months: inputModeData.mode === 'CUSTOM' ? inputModeData.customMonths : null,
      custom_start_month: inputModeData.mode === 'CUSTOM' ? inputModeData.customStartMonth : null,
      yearly_amount: inputModeData.mode !== 'MONTHLY' ? yearlyAmount : null,
    }

    formSubmitting.current = true
    updateInputModeMutation.mutate({ id: categoryId, data })
  }

  const calculateTotal = (category: BudgetCategory) => {
    // For YEARLY mode, use the yearly_amount as total
    if (category.input_mode === 'YEARLY') {
      return parseFloat(category.yearly_amount || '0')
    }

    // For CUSTOM mode, yearly_amount stores the payment amount, so multiply by custom_months
    if (category.input_mode === 'CUSTOM' && category.custom_months) {
      return parseFloat(category.yearly_amount || '0') * category.custom_months
    }

    // For MONTHLY mode, sum all entries
    const categoryEntries = entries.filter((e) => e.category === category.id && e.year === year)
    return categoryEntries.reduce((sum, entry) => {
      const amount = parseFloat(entry.actual_amount ?? entry.planned_amount)
      return sum + amount
    }, 0)
  }

  const getMonthlyAmount = (category: BudgetCategory): number => {
    if (category.input_mode === 'MONTHLY') {
      return 0 // Individual entry per month
    }

    const yearlyAmount = parseFloat(category.yearly_amount || '0')

    if (category.input_mode === 'YEARLY') {
      return yearlyAmount / 12
    }

    if (category.input_mode === 'CUSTOM' && category.custom_months) {
      // For CUSTOM mode, yearly_amount stores the payment amount, not the total
      return yearlyAmount
    }

    return 0
  }

  // Calculate total reductions for a month
  const getTotalReductionsForMonth = (month: number): number => {
    if (!salaryReductions || salaryReductions.length === 0) return 0
    
    // Find salary category
    const salaryCategory = categories.find(
      (c) => isSalaryCategory(c)
    )
    if (!salaryCategory) return 0

    // Get gross salary for the month
    let grossSalary = 0
    if (salaryCategory.input_mode === 'YEARLY' && salaryCategory.yearly_amount) {
      grossSalary = parseFloat(salaryCategory.yearly_amount) / 12
    } else if (salaryCategory.input_mode === 'CUSTOM' && salaryCategory.custom_months && salaryCategory.yearly_amount) {
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
        grossSalary = parseFloat(salaryCategory.yearly_amount)
      }
    } else if (salaryCategory.input_mode === 'MONTHLY') {
      const salaryEntry = entries.find(
        (e) => e.category === salaryCategory.id && e.year === year && e.month === month
      )
      if (salaryEntry) {
        grossSalary = parseFloat(salaryEntry.actual_amount ?? salaryEntry.planned_amount)
      }
    }

    if (grossSalary === 0) return 0

    // Calculate total reductions
    return salaryReductions
      .filter(r => r.is_active)
      .reduce((sum, reduction) => {
        if (reduction.reduction_type === 'PERCENTAGE') {
          return sum + (grossSalary * parseFloat(reduction.value)) / 100
        } else {
          return sum + parseFloat(reduction.value)
        }
      }, 0)
  }

  // Calculate total amount for a category in a specific month
  const getCategoryAmountForMonth = (category: BudgetCategory, month: number): number => {
    let amount = 0

    // For MONTHLY mode, get the entry for this month
    if (category.input_mode === 'MONTHLY') {
      const categoryEntries = entries.filter(
        (e) => e.category === category.id && e.year === year && e.month === month
      )
      amount = categoryEntries.reduce((sum, entry) => {
        return sum + parseFloat(entry.actual_amount ?? entry.planned_amount)
      }, 0)
    } else if (category.input_mode === 'YEARLY') {
      // For YEARLY mode, distribute evenly
      const yearlyAmount = parseFloat(category.yearly_amount || '0')
      amount = yearlyAmount / 12
    } else if (category.input_mode === 'CUSTOM' && category.custom_months) {
      // For CUSTOM mode, check if this month is a payment month
      const startMonth = category.custom_start_month || 1
      const monthsInterval = 12 / category.custom_months
      const paymentMonths: number[] = []
      for (let i = 0; i < category.custom_months; i++) {
        const calculatedMonth = startMonth + (i * monthsInterval)
        let paymentMonth = Math.round(calculatedMonth)
        while (paymentMonth > 12) paymentMonth -= 12
        while (paymentMonth < 1) paymentMonth += 12
        paymentMonths.push(paymentMonth)
      }
      
      if (paymentMonths.includes(month)) {
        // This month has a payment
        amount = parseFloat(category.yearly_amount || '0')
      }
    }

    // For income type, if it's salary, subtract reductions to get net salary
    if (type === 'INCOME' && category.id === categories.find(isSalaryCategory)?.id) {
      const reductions = getTotalReductionsForMonth(month)
      return Math.max(0, amount - reductions)
    }

    return amount
  }

  // Calculate yearly total for all categories in this group
  const yearlyTotal = categories.reduce((sum, category) => sum + Array.from({ length: 12 }, (_, i) => getCategoryAmountForMonth(category, i + 1)).reduce((total, amount) => total + amount, 0), 0)

  // Add category button labels
  const ADD_LABELS: Record<string, string> = {
    INCOME: t('categoryType.addIncome'),
    FIXED_EXPENSE: t('categoryType.addFixedExpense'),
    VARIABLE_EXPENSE: t('categoryType.addVariableExpense'),
    SAVINGS: t('categoryType.addSavings'),
  }

  return (
    <>
      <tr
        className={`${TYPE_COLORS[type]} border-t-2 border-gray-300 dark:border-gray-600`}
      >
        {isCollapsed ? (
          <>
            {/* When collapsed, show individual cells with total in Gesamt column */}
            <td className="px-4 py-2 text-sm font-bold sticky left-0 border-r border-gray-300 dark:border-gray-600">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-gray-300 dark:border-gray-600"
                  title={t('common.expand')}
                  aria-label={t('common.expand')}
                >
                  <span className="text-sm transition-transform duration-200 rotate-0">
                    ▶
                  </span>
                </button>
                <span>{TYPE_LABELS[type]}</span>
                <span className="text-xs font-normal opacity-75">({categories.length})</span>
              </div>
            </td>
            <td className="px-3 py-2 text-center">
              {/* Empty cell for category type column */}
            </td>
            {displayMonths.map((month) => (
              <td key={month} className="px-3 py-2 text-center">
                {/* Empty cells for month columns */}
              </td>
            ))}
            <td className="px-3 py-2 text-center text-sm font-bold bg-gray-50 dark:bg-gray-700/50">
              {formatCurrency(yearlyTotal, displayCurrency)}
            </td>
            <td className="px-3 py-2 text-center">
              {/* Empty cell for actions column */}
            </td>
          </>
        ) : (
          <td
            colSpan={displayMonths.length + 4}
            className="px-4 py-2 text-sm font-bold"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md active:scale-95 border border-gray-300 dark:border-gray-600"
                title={t('common.collapse')}
                aria-label={t('common.collapse')}
              >
                <span className="text-sm transition-transform duration-200 rotate-90">
                  ▶
                </span>
              </button>
              <span>{TYPE_LABELS[type]}</span>
              <span className="text-xs font-normal opacity-75">({categories.length})</span>
              {onAddCategory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddCategory(type)
                  }}
                  className={`px-4 py-2 text-white rounded hover:opacity-90 text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95 ${
                    type === 'INCOME' ? 'bg-green-500 hover:bg-green-600' :
                    type === 'FIXED_EXPENSE' ? 'bg-blue-500 hover:bg-blue-600' :
                    type === 'VARIABLE_EXPENSE' ? 'bg-purple-500 hover:bg-purple-600' :
                    'bg-yellow-500 hover:bg-yellow-600'
                  }`}
                >
                  {ADD_LABELS[type]}
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {!isCollapsed && (
        <>
      {[...categories].sort((a, b) => a.order - b.order).map((category) => (
        <tr
          key={category.id}
          onDragOver={(e) => handleDragOver(e, category.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, category.id)}
          className={`group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
            draggedCategoryId === category.id ? 'opacity-50 bg-blue-100 dark:bg-blue-900/20' : ''
          } ${
            dragOverCategoryId === category.id ? 'border-t-4 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30' : ''
          }`}
        >
          <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50">
            <div className="flex items-center gap-1.5 min-w-0">
              <span 
                className="cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 select-none inline-block px-1" 
                title={t('category.dragToReorder')}
                draggable
                onDragStart={(e) => {
                  handleDragStart(e, category.id)
                }}
                onDragEnd={handleDragEnd}
              >⋮⋮</span>
              <span className="truncate">{category.name}</span>
              {/* Show "Brutto" label for salary category */}
              {category.id === categories.find(isSalaryCategory)?.id && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded flex-shrink-0" title={t('category.gross')}>
                  {t('category.gross')}
                </span>
              )}
              {/* Subtle input mode indicator */}
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0" title={t('inputMode.inputMode')}>
                {category.input_mode === 'YEARLY' && '📅'}
                {category.input_mode === 'MONTHLY' && '📆'}
                {category.input_mode === 'CUSTOM' && '📊'}
              </span>
            </div>
            {/* Rename Category Dialog */}
            {editingName === category.id && (
              <CellEditorDialog label={`${t('category.rename')}: ${category.name}`} onCancel={handleCancelEditName}>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded space-y-2">
                <p id={`category-error-${category.id}`} role={formError ? 'alert' : undefined} className="text-xs text-red-700 dark:text-red-300">{formError}</p>
                <div>
                  <label htmlFor={`category-name-${category.id}`} className="block text-xs font-medium mb-1">{t('category.categoryName')}:</label>
                  <input
                    type="text"
                    id={`category-name-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`}
                    disabled={updateCategoryNameMutation.isPending}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSaveName(category.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        handleCancelEditName()
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleSaveName(category.id)}
                    disabled={updateCategoryNameMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    ✓ {t('common.save')}
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    disabled={updateCategoryNameMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
                  >
                    ✕ {t('common.cancel')}
                  </button>
                </div>
              </div>
              </CellEditorDialog>
            )}
            {editingInputMode === category.id && (
              <CellEditorDialog label={`${t('inputMode.changeInputMode')}: ${category.name}`} onCancel={() => { if (!formSubmitting.current) setEditingInputMode(null) }}>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded space-y-2">
                <p className="text-xs text-amber-800 dark:text-amber-200">{t('gridUX.globalHelp')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{t('gridUX.chfHelp')}</p>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmedGlobalChange} onChange={e => setConfirmedGlobalChange(e.target.checked)} disabled={updateInputModeMutation.isPending} />{t('gridUX.confirmGlobal')}</label>
                <p id={`category-error-${category.id}`} role={formError ? 'alert' : undefined} className="text-xs text-red-700 dark:text-red-300">{formError}</p>
                <div>
                  <label htmlFor={`category-mode-${category.id}`} className="block text-xs font-medium mb-1">{t('inputMode.inputMode')}:</label>
                  <select
                    autoFocus id={`category-mode-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`} disabled={updateInputModeMutation.isPending} value={inputModeData.mode}
                    onChange={(e) => setInputModeData({ ...inputModeData, mode: e.target.value as InputMode })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSaveInputMode(category.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        if (!formSubmitting.current) setEditingInputMode(null)
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                  >
                    <option value="MONTHLY">{t('inputMode.monthly')}</option>
                    <option value="YEARLY">{t('inputMode.yearly')}</option>
                    <option value="CUSTOM">{t('inputMode.custom')}</option>
                  </select>
                </div>
                {inputModeData.mode === 'CUSTOM' && (
                  <>
                    <div>
                      <label htmlFor={`category-count-${category.id}`} className="block text-xs font-medium mb-1">{t('inputMode.numberOfMonths')}:</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        id={`category-count-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`} disabled={updateInputModeMutation.isPending} value={inputModeData.customMonths}
                        onChange={(e) => setInputModeData({ ...inputModeData, customMonths: parseInt(e.target.value) })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSaveInputMode(category.id)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            if (!formSubmitting.current) setEditingInputMode(null)
                          }
                        }}
                        className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                      />
                    </div>
                    <div>
                      <label htmlFor={`category-start-${category.id}`} className="block text-xs font-medium mb-1">{t('inputMode.startMonth')}:</label>
                      <select
                        id={`category-start-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`} disabled={updateInputModeMutation.isPending} value={inputModeData.customStartMonth}
                        onChange={(e) => setInputModeData({ ...inputModeData, customStartMonth: parseInt(e.target.value) })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSaveInputMode(category.id)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            if (!formSubmitting.current) setEditingInputMode(null)
                          }
                        }}
                        className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                      >
                        {MONTH_FULL_NAMES.map((name, idx) => (
                          <option key={idx + 1} value={idx + 1}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {inputModeData.mode !== 'MONTHLY' && (
                  <div>
                    {inputModeData.mode === 'CUSTOM' && (
                      <div className="mb-2">
                        <label className="block text-[10px] font-medium mb-1">{t('inputMode.inputType')}:</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-[10px]">
                            <input
                              type="radio"
                              name={`customAmountType-${category.id}`}
                              disabled={updateInputModeMutation.isPending}
                              checked={inputModeData.customAmountType === 'payment'}
                              onChange={() => setInputModeData({ ...inputModeData, customAmountType: 'payment' })}
                              className="w-3 h-3"
                            />
                            <span>{t('inputMode.perPayment')}</span>
                          </label>
                          <label className="flex items-center gap-1 text-[10px]">
                            <input
                              type="radio"
                              name={`customAmountType-${category.id}`}
                              disabled={updateInputModeMutation.isPending}
                              checked={inputModeData.customAmountType === 'total'}
                              onChange={() => setInputModeData({ ...inputModeData, customAmountType: 'total' })}
                              className="w-3 h-3"
                            />
                            <span>{t('inputMode.totalAmount')}</span>
                          </label>
                        </div>
                      </div>
                    )}
                    <label htmlFor={`category-amount-${category.id}`} className="block text-xs font-medium mb-1">
                      {inputModeData.mode === 'YEARLY' 
                        ? `${t('inputMode.yearlyAmount')}:` 
                        : inputModeData.customAmountType === 'total' 
                          ? `${t('inputMode.totalAmount')}:` 
                          : `${t('inputMode.paymentAmount')}:`} (CHF)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id={`category-amount-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`} disabled={updateInputModeMutation.isPending} value={inputModeData.yearlyAmount}
                      onChange={(e) => setInputModeData({ ...inputModeData, yearlyAmount: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveInputMode(category.id)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          if (!formSubmitting.current) setEditingInputMode(null)
                        }
                      }}
                      className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                    />
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                      {inputModeData.mode === 'YEARLY' ? (
                        <>{t('inputMode.monthlyCalculated', { amount: formatCurrency(
                          parseFloat(inputModeData.yearlyAmount || '0') / 12,
                          displayCurrency
                        )})}</>
                      ) : inputModeData.customAmountType === 'total' ? (
                        <>{t('inputMode.perPaymentCalculated', { count: inputModeData.customMonths, amount: formatCurrency(
                          parseFloat(inputModeData.yearlyAmount || '0') / inputModeData.customMonths,
                          displayCurrency
                        )})}</>
                      ) : (
                        <>{t('inputMode.totalCalculated', { count: inputModeData.customMonths, amount: formatCurrency(
                          parseFloat(inputModeData.yearlyAmount || '0') * inputModeData.customMonths,
                          displayCurrency
                        )})}</>
                      )}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSaveInputMode(category.id)}
                    disabled={updateInputModeMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    ✓ {t('common.save')}
                  </button>
                  <button
                    onClick={() => { if (!formSubmitting.current) setEditingInputMode(null) }}
                    disabled={updateInputModeMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
                  >
                    ✕ {t('common.cancel')}
                  </button>
                </div>
              </div>
              </CellEditorDialog>
            )}
            {/* Autofill Dialog */}
            {showAutofillDialog === category.id && (
              <CellEditorDialog label={`${t('autofill.autofillAll')}: ${category.name}`} onCancel={() => { if (!formSubmitting.current) setShowAutofillDialog(null) }}>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded space-y-3 border border-gray-300 dark:border-gray-600">
                <p className="text-xs text-gray-600 dark:text-gray-300">{t('gridUX.autofillHelp', { year })}</p>
                <p id={`category-error-${category.id}`} role={formError ? 'alert' : undefined} className="text-xs text-red-700 dark:text-red-300">{formError}</p>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-white">
                    🔄 {t('autofill.title')}
                  </h4>
                </div>

                <div>
                  <label htmlFor={`category-autofill-${category.id}`} className="block text-xs font-medium mb-1">{t('autofill.amountPerMonth')} (CHF):</label>
                  <input
                    type="number"
                    step="0.01"
                    id={`category-autofill-${category.id}`} aria-invalid={!!formError} aria-describedby={`category-error-${category.id}`} disabled={autofillMonthsMutation.isPending} value={autofillData.amount}
                    onChange={(e) => setAutofillData({ ...autofillData, amount: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAutofill(category.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        if (!formSubmitting.current) setShowAutofillDialog(null)
                      }
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs border rounded dark:bg-gray-600 dark:border-gray-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium mb-0.5">{t('autofill.fillMode')}:</label>
                  <div className="space-y-0.5">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        disabled={autofillMonthsMutation.isPending}
                        checked={autofillData.mode === 'all'}
                        onChange={() => setAutofillData({ ...autofillData, mode: 'all' })}
                        className="text-purple-600"
                      />
                      <span>{t('autofill.fillAll')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        disabled={autofillMonthsMutation.isPending}
                        checked={autofillData.mode === 'empty'}
                        onChange={() => setAutofillData({ ...autofillData, mode: 'empty' })}
                        className="text-purple-600"
                      />
                      <span>{t('autofill.fillEmpty')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        disabled={autofillMonthsMutation.isPending}
                        checked={autofillData.mode === 'remaining'}
                        onChange={() => setAutofillData({ ...autofillData, mode: 'remaining' })}
                        className="text-purple-600"
                      />
                      <span>{t('autofill.fillFromMonth')}:</span>
                      {autofillData.mode === 'remaining' && (
                        <select
                          aria-label={t('inputMode.startMonth')} disabled={autofillMonthsMutation.isPending} value={autofillData.startMonth}
                          onChange={(e) => setAutofillData({ ...autofillData, startMonth: parseInt(e.target.value) })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAutofill(category.id)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              if (!formSubmitting.current) setShowAutofillDialog(null)
                            }
                          }}
                          className="px-1.5 py-0.5 text-[10px] border rounded dark:bg-gray-600 dark:border-gray-500"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleAutofill(category.id)}
                    disabled={autofillMonthsMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {autofillMonthsMutation.isPending ? `⏳ ${t('autofill.filling')}` : `✓ ${t('autofill.fill')}`}
                  </button>
                  <button
                    onClick={() => { if (!formSubmitting.current) setShowAutofillDialog(null) }}
                    disabled={autofillMonthsMutation.isPending}
                    className="flex-1 px-3 py-2 text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300"
                  >
                    ✕ {t('common.cancel')}
                  </button>
                </div>
              </div>
              </CellEditorDialog>
            )}
          </td>
          <td className="px-3 py-2 text-center">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${TYPE_COLORS[type]}`}>
              {TYPE_LABELS[category.category_type]}
            </span>
          </td>
          {displayMonths.map((month) => {
            const entry = getEntryForCategoryAndMonth(category.id, month)
            const monthlyAmount = getMonthlyAmount(category)
            return (
              <MonthlyCell
                key={`${category.id}-${year}-${month}`}
                categoryId={category.id}
                month={month}
                entry={entry}
                budgetId={budgetId}
                budgetYear={year}
                onEditSettings={() => handleEditInputMode(category)}
                displayCurrency={displayCurrency}
                category={category}
                calculatedMonthlyAmount={monthlyAmount}
              />
            )
          })}
          <td className="px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50">
            {formatCurrency(calculateTotal(category), displayCurrency)}
          </td>
          <td className="px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 flex-nowrap">
              {/* Rename button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditName(category)
                }}
                className="text-sm px-1.5 py-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                aria-label={t('category.rename') + ": " + category.name} title={t('category.rename')}
              >
                ✏️
              </button>
              {/* Input mode edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditInputMode(category)
                }}
                className="text-sm px-1.5 py-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                aria-label={t('inputMode.changeInputMode') + ": " + category.name} title={t('inputMode.changeInputMode')}
              >
                ⚙️
              </button>
              {/* Autofill button - only in monthly mode and yearly view */}
              {category.input_mode === 'MONTHLY' && displayMonths.length === 12 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenAutofill(category)
                  }}
                  className="text-sm px-1.5 py-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
                  aria-label={t('autofill.autofillAll') + ": " + category.name} title={t('autofill.autofillAll')}
                >
                  🔄
                </button>
              )}
              {/* Copy button - only in monthly mode and single month view */}
              {category.input_mode === 'MONTHLY' && displayMonths.length === 1 && displayMonths[0] > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (copySubmitting.current) return
                    copySubmitting.current = true
                    copyPreviousMonthMutation.mutate({ categoryId: category.id, month: displayMonths[0] })
                  }}
                  disabled={copyPreviousMonthMutation.isPending}
                  className="text-sm px-1.5 py-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={t('entry.copyPreviousMonth') + ": " + category.name} title={t('entry.copyPreviousMonth')}
                >
                  ⏮️
                </button>
              )}
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteCategory(category.id, category.name)
                }}
                disabled={deleteCategoryMutation.isPending || updateInputModeMutation.isPending || updateCategoryNameMutation.isPending || autofillMonthsMutation.isPending}
                className="text-sm px-1.5 py-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('common.delete') + ": " + category.name} title={t('common.delete')}
              >
                🗑️
              </button>
            </div>
          </td>
        </tr>
      ))}
          {/* Total Row for INCOME, FIXED_EXPENSE and VARIABLE_EXPENSE */}
          {(type === 'INCOME' || type === 'FIXED_EXPENSE' || type === 'VARIABLE_EXPENSE') && categories.length > 0 && (
            <tr className={`${TYPE_COLORS[type]} border-t-2 ${type === 'VARIABLE_EXPENSE' ? 'border-purple-300 dark:border-purple-600' : 'border-gray-300 dark:border-gray-600'} font-bold`}>
              <td className={`px-4 py-2 text-sm font-bold sticky left-0 border-r ${type === 'VARIABLE_EXPENSE' ? 'border-purple-300 dark:border-purple-600' : 'border-gray-300 dark:border-gray-600'}`}>
                {t('common.total')}
              </td>
              <td className="px-3 py-2 text-center">
                {/* Empty cell for category type column */}
              </td>
              {displayMonths.map((month) => {
                const monthlyTotal = categories.reduce((sum, category) => {
                  return sum + getCategoryAmountForMonth(category, month)
                }, 0)
                return (
                  <td
                    key={month}
                    className={`px-3 py-2 text-center text-sm border font-bold ${type === 'VARIABLE_EXPENSE' ? 'border-purple-300 dark:border-purple-600' : ''}`}
                  >
                    {formatCurrency(monthlyTotal, displayCurrency)}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center text-sm font-bold bg-gray-50 dark:bg-gray-700/50">
                {formatCurrency(
                  yearlyTotal,
                  displayCurrency
                )}
              </td>
              <td className="px-3 py-2 text-center">
                {/* Empty cell for actions column */}
              </td>
            </tr>
          )}
        </>
      )}
    </>
  )
}

export default CategoryRow
