import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { budgetApi } from '../services/api'
import type { Budget } from '../types/budget'

function BudgetDashboard() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [newBudgetName, setNewBudgetName] = useState('')
  const [newBudgetYear, setNewBudgetYear] = useState(new Date().getFullYear())

  const { data: budgets, isLoading, error } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await budgetApi.getAll()
      return response.data.results || []
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<Budget>) => budgetApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      setIsCreating(false)
      setNewBudgetName('')
      setNewBudgetYear(new Date().getFullYear())
      toast.success('Budget erfolgreich erstellt!')
    },
    onError: () => {
      toast.error('Fehler beim Erstellen des Budgets')
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
        currency: 'EUR',
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
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Budgets...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 mb-4">Fehler beim Laden der Budgets</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['budgets'] })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          💰 Budget Planer
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Verwalten Sie Ihre Finanzen einfach und übersichtlich
        </p>
      </div>

      {/* Create Budget Button */}
      {!isCreating && (
        <div className="mb-6">
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            Neues Budget erstellen
          </button>
        </div>
      )}

      {/* Create Budget Form */}
      {isCreating && (
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Neues Budget erstellen
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Budget Name *
              </label>
              <input
                type="text"
                value={newBudgetName}
                onChange={(e) => setNewBudgetName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all"
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
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all"
                min="2000"
                max="2100"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
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
                }}
                disabled={createMutation.isPending}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all font-semibold disabled:opacity-50"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Grid */}
      {budgets && budgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((budget) => (
            <div
              key={budget.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all border border-gray-200 dark:border-gray-700 overflow-hidden group"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">
                      {budget.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{budget.year}</span>
                      <span>•</span>
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-xs font-semibold">
                        {budget.currency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Erstellt am {new Date(budget.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    to={`/budget/${budget.id}`}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    Öffnen
                  </Link>
                  <button
                    onClick={() => handleDelete(budget.id, budget.name)}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all font-semibold disabled:opacity-50"
                    title="Budget löschen"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Noch keine Budgets vorhanden
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Erstellen Sie Ihr erstes Budget, um mit der Finanzplanung zu beginnen
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold inline-flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            Erstes Budget erstellen
          </button>
        </div>
      )}
    </div>
  )
}

export default BudgetDashboard
