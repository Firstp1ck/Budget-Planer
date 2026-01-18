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
    <div className="w-full px-4 py-8 animate-fade-in">
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
            <div
              key={budget.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700 overflow-hidden group transform hover:-translate-y-1"
            >
              <div className="p-7">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {budget.name}
                    </h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{budget.year}</span>
                      <span className="text-slate-400">•</span>
                      <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                        {budget.currency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-5 pb-5 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Erstellt am {new Date(budget.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Link
                    to={`/budget/${budget.id}`}
                    className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-lg transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm flex items-center justify-center"
                  >
                    Öffnen
                  </Link>
                  <button
                    onClick={() => handleDelete(budget.id, budget.name)}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-all font-medium disabled:opacity-50 shadow-sm border border-red-200 dark:border-red-800 text-sm"
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
