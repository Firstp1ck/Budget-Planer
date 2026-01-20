import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { budgetApi, templateApi, categoryApi, taxApi } from '../services/api'
import type { Budget, BudgetTemplate, CategoryType, BudgetSummaryData, PaginatedResponse } from '../types/budget'
import BudgetCard from '../components/BudgetCard'

function BudgetDashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [newBudgetName, setNewBudgetName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Test backend connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        await budgetApi.health()
        console.log('Backend connection test: SUCCESS')
      } catch (error: any) {
        console.error('Backend connection test: FAILED', error)
        if (error?.message?.includes('Network Error') || error?.code === 'ERR_NETWORK') {
          console.error('Backend server is not accessible. Please ensure:')
          console.error('1. The backend server is running on http://localhost:8000')
          console.error('2. No firewall is blocking the connection')
          console.error('3. The Tauri app started the backend server successfully')
        }
      }
    }
    testConnection()
  }, [])

  const { data: budgets, isLoading, error } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      try {
        const response = await budgetApi.getAll()
        // Check if response.data is actually an object (not HTML string)
        // TypeScript type narrowing: check if data is a string first
        const responseData = response.data as any
        if (typeof responseData === 'string' && responseData.includes('<!doctype')) {
          throw new Error('Received HTML instead of JSON. Backend server may not be running.')
        }
        // Now TypeScript knows it's not a string, so we can access .results
        return (responseData as PaginatedResponse<Budget>).results || []
      } catch (error: any) {
        console.error('Error fetching budgets:', error)
        throw error
      }
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
      const defaultCategories: Array<{ name: string; category_type: CategoryType; order: number }> = [
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
      try {
        const response = await budgetApi.create(data)
        console.log('Budget creation API response:', response)
        console.log('Budget creation response.data:', response.data)
        console.log('Budget creation response.status:', response.status)
        
        // Handle different response structures
        let budgetData = response.data
        
        // Check if response is wrapped in pagination format (shouldn't happen for POST, but check anyway)
        if (budgetData && 'results' in budgetData && Array.isArray(budgetData.results) && budgetData.results.length > 0) {
          budgetData = budgetData.results[0]
          console.log('Found budget in pagination results:', budgetData)
        }
        
        // Validate the response has an id
        if (!budgetData || typeof budgetData.id === 'undefined') {
          console.error('Invalid budget response structure:', {
            response: response.data,
            budgetData,
            hasId: budgetData?.id !== undefined,
            type: typeof budgetData?.id
          })
          throw new Error(`Invalid response: Budget ID not found. Response: ${JSON.stringify(response.data)}`)
        }
        
        return budgetData
      } catch (error: any) {
        console.error('Budget creation error details:', {
          error,
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          statusText: error?.response?.statusText
        })
        throw error
      }
    },
    onSuccess: async (newBudget) => {
      console.log('Budget created successfully:', newBudget)
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      
      if (!newBudget || !newBudget.id) {
        console.error('Budget creation response missing ID:', {
          newBudget,
          hasId: newBudget?.id !== undefined,
          idType: typeof newBudget?.id,
          keys: newBudget ? Object.keys(newBudget) : []
        })
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
      setSelectedTemplateId(null)
    },
    onError: (error: any) => {
      console.error('Budget creation error:', error)
      console.error('Error details:', {
        message: error?.message,
        response: error?.response,
        request: error?.request,
        code: error?.code,
        config: error?.config
      })
      
      // Determine error message based on error type
      let errorMessage = 'Fehler beim Erstellen des Budgets'
      
      if (error?.response) {
        // Server responded with error status
        const status = error.response.status
        const data = error.response.data
        
        if (data?.message) {
          errorMessage = data.message
        } else if (data?.error) {
          errorMessage = data.error
        } else if (data?.detail) {
          errorMessage = data.detail
        } else if (status === 400) {
          errorMessage = 'Ungültige Daten. Bitte überprüfen Sie Ihre Eingaben.'
        } else if (status === 500) {
          errorMessage = 'Serverfehler. Bitte versuchen Sie es später erneut.'
        } else if (status === 404) {
          errorMessage = 'API-Endpunkt nicht gefunden. Bitte überprüfen Sie die Backend-Konfiguration.'
        } else {
          errorMessage = `Serverfehler (${status}). Bitte versuchen Sie es später erneut.`
        }
      } else if (error?.request) {
        // Request was made but no response received
        errorMessage = 'Keine Verbindung zum Backend. Stellen Sie sicher, dass der Backend-Server läuft (http://localhost:8000).'
      } else if (error?.message) {
        // Network error or other error
        if (error.message.includes('HTML instead of JSON') || error.isHtmlResponse) {
          errorMessage = 'Backend-Server nicht erreichbar. Die Anfrage wurde an die falsche Adresse gesendet. Bitte starten Sie die Anwendung neu oder überprüfen Sie, ob der Backend-Server läuft.'
        } else if (error.message.includes('Network Error') || error.message.includes('ERR_NETWORK')) {
          errorMessage = 'Netzwerkfehler. Stellen Sie sicher, dass der Backend-Server läuft (http://localhost:8000).'
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Zeitüberschreitung. Der Server antwortet nicht. Bitte versuchen Sie es später erneut.'
        } else {
          errorMessage = `Fehler: ${error.message}`
        }
      }
      
      toast.error(errorMessage, {
        duration: 5000, // Show for 5 seconds
      })
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

  const handleExport = async (budgetId: number) => {
    try {
      const response = await budgetApi.export(budgetId)
      const data = response.data
      
      // Create a JSON blob
      const jsonString = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      // Create a temporary link and trigger download
      const link = document.createElement('a')
      link.href = url
      // Sanitize budget name for filename
      const sanitizedName = data.budget.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      link.download = `budget_${sanitizedName}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success('Budget erfolgreich exportiert!')
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error('Fehler beim Exportieren des Budgets')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      let data: BudgetSummaryData
      
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        console.error('JSON parse error:', parseError)
        toast.error('Ungültige JSON-Datei. Bitte überprüfen Sie das Dateiformat.')
        return
      }
      
      // Validate the data structure
      if (!data.budget) {
        toast.error('Ungültige Budget-Datei: "budget" Objekt fehlt')
        return
      }
      
      if (!data.categories || !Array.isArray(data.categories)) {
        toast.error('Ungültige Budget-Datei: "categories" Array fehlt')
        return
      }
      
      if (!data.budget.name) {
        toast.error('Ungültige Budget-Datei: Budget-Name fehlt')
        return
      }
      
      if (!data.budget.currency) {
        toast.error('Ungültige Budget-Datei: Währung fehlt')
        return
      }

      // Import the budget
      const response = await budgetApi.import(data)
      const newBudget = response.data
      
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Budget erfolgreich importiert!')
      navigate(`/budget/${newBudget.id}`)
    } catch (error: any) {
      console.error('Import error:', error)
      
      // Extract detailed error message
      let errorMessage = 'Fehler beim Importieren des Budgets'
      
      if (error.response?.data) {
        const errorData = error.response.data
        
        // Handle Django REST Framework error format
        if (typeof errorData === 'object') {
          // Check for non-field errors
          if (errorData.non_field_errors) {
            errorMessage = `Import-Fehler: ${Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors.join(', ') : errorData.non_field_errors}`
          }
          // Check for field-specific errors
          else if (errorData.message) {
            errorMessage = `Import-Fehler: ${errorData.message}`
          }
          // Check for serializer validation errors
          else {
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
              .join('; ')
            if (fieldErrors) {
              errorMessage = `Validierungsfehler: ${fieldErrors}`
            }
          }
        } else if (typeof errorData === 'string') {
          errorMessage = `Import-Fehler: ${errorData}`
        }
      } else if (error.message) {
        errorMessage = `Import-Fehler: ${error.message}`
      }
      
      toast.error(errorMessage)
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler'
    const errorDetails = error instanceof Error && 'response' in error 
      ? (error as any).response?.data || (error as any).response?.statusText || errorMessage
      : errorMessage
    
    // Check if it's a network error
    const isNetworkError = errorMessage.includes('Network Error') || 
                          errorMessage.includes('ERR_NETWORK') ||
                          (error as any)?.code === 'ERR_NETWORK' ||
                          (error as any)?.message?.includes('Network Error')
    
    console.error('Budget loading error:', error)
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white dark:bg-slate-800 rounded-xl p-12 shadow-md border border-slate-200 dark:border-slate-700 max-w-2xl">
          <div className="text-7xl mb-6 animate-pulse">⚠️</div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">Fehler beim Laden der Budgets</p>
          {isNetworkError ? (
            <>
              <p className="text-base text-slate-700 dark:text-slate-300 mb-4 font-semibold">
                Backend-Server nicht erreichbar
              </p>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-6 text-left bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                <p className="mb-2">Mögliche Ursachen:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Der Backend-Server wurde nicht gestartet</li>
                  <li>Der Server läuft nicht auf Port 8000</li>
                  <li>Eine Firewall blockiert die Verbindung</li>
                  <li>Python oder die Backend-Abhängigkeiten fehlen</li>
                </ul>
                <p className="mt-4 mb-2">Bitte überprüfen Sie:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Die Konsolen-Ausgabe der Anwendung</li>
                  <li>Ob der Backend-Server erfolgreich gestartet wurde</li>
                  <li>Die Logs für Fehlermeldungen</li>
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 font-mono break-all">
              {String(errorDetails)}
            </p>
          )}
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

      {/* Action Buttons */}
      {!isCreating && (
        <div className="mb-8 flex flex-wrap gap-3">
          <button
            onClick={() => setIsCreating(true)}
            className="group px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium flex items-center gap-2 text-sm"
          >
            <span className="text-base group-hover:scale-110 transition-transform">+</span>
            Neues Budget erstellen
          </button>
          <button
            onClick={handleImportClick}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium flex items-center gap-2 text-sm"
          >
            <span className="text-base">📥</span>
            Budget importieren
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
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
                placeholder="z.B. Haushaltsbudget"
                autoFocus
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
              onExport={handleExport}
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
