import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { budgetApi, templateApi, categoryApi, taxApi } from '../services/api'
import type { Budget, BudgetTemplate } from '../types/budget'
import BudgetCard from '../components/BudgetCard'

function BudgetDashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [newBudgetName, setNewBudgetName] = useState('')
  const [newBudgetYear, setNewBudgetYear] = useState(new Date().getFullYear())
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)

  const { data: budgets, isLoading, error } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await budgetApi.getAll()
      return response.data.results || []
    },
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await templateApi.getAll()
      return response.data.results || []
    },
    enabled: isCreating, // Only fetch when creating
  })

  const applyTemplateMutation = useMutation({
    mutationFn: ({ templateId, budgetId }: { templateId: number; budgetId: number }) =>
      templateApi.apply(templateId, budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      toast.success('Vorlage erfolgreich angewendet!')
    },
    onError: () => {
      toast.error('Fehler beim Anwenden der Vorlage')
    },
  })

  const createDefaultCategoriesAndTaxes = async (budgetId: number) => {
    try {
      // Create default categories in order
      const defaultCategories = [
        { name: 'Gehalt', category_type: 'INCOME', order: 0 },
        { name: 'Miete', category_type: 'FIXED_EXPENSE', order: 0 },
        { name: 'Krankenversicherung', category_type: 'FIXED_EXPENSE', order: 1 },
        { name: 'Lebensmittel', category_type: 'VARIABLE_EXPENSE', order: 0 },
        { name: 'Haushalt', category_type: 'VARIABLE_EXPENSE', order: 1 },
      ]

      for (const category of defaultCategories) {
        try {
          const response = await categoryApi.create(budgetId, {
            ...category,
            is_active: true,
            input_mode: 'MONTHLY',
            custom_months: null,
            custom_start_month: null,
            yearly_amount: null,
          })
          console.log('Created category:', response.data)
        } catch (error: any) {
          console.error(`Failed to create category ${category.name}:`, error.response?.data || error.message)
          throw error
        }
      }

      // Create default taxes
      const defaultTaxes = [
        { name: 'Kantonssteuern', percentage: '5.00' },
        { name: 'Gemeindesteuern', percentage: '2.50' },
        { name: 'Bundessteuer + Kirche', percentage: '1.00' },
      ]

      for (let i = 0; i < defaultTaxes.length; i++) {
        try {
          const response = await taxApi.create({
            budget: budgetId,
            name: defaultTaxes[i].name,
            percentage: defaultTaxes[i].percentage,
            order: i,
            is_active: true,
          })
          console.log('Created tax:', response.data)
        } catch (error: any) {
          console.error(`Failed to create tax ${defaultTaxes[i].name}:`, error.response?.data || error.message)
          throw error
        }
      }
    } catch (error: any) {
      console.error('Error creating default categories/taxes:', error)
      console.error('Error details:', error.response?.data || error.message)
      throw error
    }
  }

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Budget>) => {
      const response = await budgetApi.create(data)
      return response.data
    },
    onSuccess: async (newBudget) => {
      console.log('Budget created:', newBudget)
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      
      if (!newBudget || !newBudget.id) {
        console.error('Budget creation response:', newBudget)
        toast.error('Fehler: Budget-ID nicht erhalten')
        return
      }

      const budgetId = newBudget.id

      // Apply template if one was selected
      if (selectedTemplateId) {
        try {
          await applyTemplateMutation.mutateAsync({
            templateId: selectedTemplateId,
            budgetId: budgetId,
          })
          setIsCreating(false)
          setNewBudgetName('')
          setNewBudgetYear(new Date().getFullYear())
          setSelectedTemplateId(null)
          toast.success('Budget mit Vorlage erfolgreich erstellt!')
          navigate(`/budget/${budgetId}`)
          return
        } catch (error) {
          console.error('Error applying template:', error)
          // Error already handled by mutation
        }
      }

      // Create default categories and taxes if no template was selected
      try {
        console.log('Creating default categories and taxes for budget:', budgetId)
        await createDefaultCategoriesAndTaxes(budgetId)
        // Wait a bit to ensure backend has processed everything
        await new Promise(resolve => setTimeout(resolve, 100))
        // Invalidate and refetch to ensure UI is updated
        await queryClient.invalidateQueries({ queryKey: ['budget', budgetId, 'summary'] })
        await queryClient.refetchQueries({ queryKey: ['budget', budgetId, 'summary'] })
        toast.success('Budget mit Standard-Kategorien erfolgreich erstellt!')
      } catch (error: any) {
        console.error('Error creating defaults:', error)
        const errorMessage = error.response?.data?.message || error.message || 'Unbekannter Fehler'
        toast.error(`Budget erstellt, aber Fehler beim Erstellen der Standard-Kategorien: ${errorMessage}`)
      }

      setIsCreating(false)
      setNewBudgetName('')
      setNewBudgetYear(new Date().getFullYear())
      setSelectedTemplateId(null)
    },
    onError: (error: any) => {
      console.error('Budget creation error:', error)
      toast.error(error.response?.data?.message || 'Fehler beim Erstellen des Budgets')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Budget gelöscht')
    },
    onError: () => {
      toast.error('Fehler beim Löschen des Budgets')
    },
  })

  const handleCreate = () => {
    if (newBudgetName.trim()) {
      createMutation.mutate({
        name: newBudgetName,
        year: newBudgetYear,
        currency: 'CHF',
      })
    } else {
      toast.error('Bitte geben Sie einen Namen ein')
    }
  }

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Budget "${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-6"></div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Lade Budgets...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white dark:bg-slate-800 rounded-xl p-12 shadow-md border border-slate-200 dark:border-slate-700">
          <div className="text-7xl mb-6 animate-pulse">⚠️</div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mb-6">Fehler beim Laden der Budgets</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['budgets'] })}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-2xl shadow-md">
            💰
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Budget Planer
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Verwalten Sie Ihre Finanzen einfach und übersichtlich
            </p>
          </div>
        </div>
      </div>

      {/* Create Budget Button */}
      {!isCreating && (
        <div className="mb-8">
          <button
            onClick={() => setIsCreating(true)}
            className="group px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium flex items-center gap-2 text-sm"
          >
            <span className="text-base group-hover:scale-110 transition-transform">+</span>
            Neues Budget erstellen
          </button>
        </div>
      )}

      {/* Create Budget Form */}
      {isCreating && (
        <div className="mb-8 p-7 bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 animate-fade-in">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
            Neues Budget erstellen
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Budget Name *
              </label>
              <input
                type="text"
                value={newBudgetName}
                onChange={(e) => setNewBudgetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreate()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setIsCreating(false)
                    setNewBudgetName('')
                    setSelectedTemplateId(null)
                  }
                }}
                className="w-full px-5 py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700/50 dark:text-white transition-all shadow-sm focus:shadow-md"
                placeholder="z.B. Haushaltsbudget 2026"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Jahr *
              </label>
              <input
                type="number"
                value={newBudgetYear}
                onChange={(e) => setNewBudgetYear(parseInt(e.target.value))}
                className="w-full px-5 py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700/50 dark:text-white transition-all shadow-sm focus:shadow-md"
                min="2000"
                max="2100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Vorlage (optional)
              </label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-5 py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700/50 dark:text-white transition-all shadow-sm focus:shadow-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreate()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setIsCreating(false)
                    setNewBudgetName('')
                    setSelectedTemplateId(null)
                  }
                }}
              >
                <option value="">Keine Vorlage (leeres Budget)</option>
                {templatesData?.map((template: BudgetTemplate) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.categories.length} Kategorien)
                  </option>
                ))}
              </select>
              {selectedTemplateId && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  💡 Die Vorlage wird nach der Budget-Erstellung automatisch angewendet
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
              >
                {createMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Erstelle...
                  </span>
                ) : (
                  'Erstellen'
                )}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewBudgetName('')
                  setSelectedTemplateId(null)
                }}
                disabled={createMutation.isPending}
                className="px-5 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium disabled:opacity-50 shadow-sm text-sm"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Grid */}
      {budgets && budgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
          <div className="text-6xl mb-5">📊</div>
          <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
            Noch keine Budgets vorhanden
          </h3>
          <p className="text-base text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Erstellen Sie Ihr erstes Budget, um mit der Finanzplanung zu beginnen
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium inline-flex items-center gap-2 text-sm"
          >
            <span className="text-base">+</span>
            Erstes Budget erstellen
          </button>
        </div>
      )}
    </div>
  )
}

export default BudgetDashboard
