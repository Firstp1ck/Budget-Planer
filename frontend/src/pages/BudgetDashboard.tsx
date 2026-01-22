import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { budgetApi, templateApi, categoryApi, taxApi } from '../services/api'
import type { Budget, BudgetTemplate, CategoryType, BudgetSummaryData, PaginatedResponse } from '../types/budget'
import BudgetCard from '../components/BudgetCard'

function BudgetDashboard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [newBudgetName, setNewBudgetName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Backend connection is now verified by LoadingScreen before this component loads

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
    retry: 3,
    retryDelay: 1000,
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
      toast.success(t('createBudget.templateApplied'))
    },
    onError: () => {
      toast.error(t('createBudget.errorApplyingTemplateShort'))
    },
  })

  // Get translated category names based on current language
  const getTranslatedCategoryName = (key: string): string => {
    const translationKey = `categorySuggestions.${key}`
    return t(translationKey)
  }

  const getTranslatedTaxName = (key: string): string => {
    const translationKey = `defaultTaxes.${key}`
    return t(translationKey)
  }

  const createDefaultCategoriesAndTaxes = async (budgetId: number) => {
    try {
      // Create default categories in order - use translated names
      const defaultCategories: Array<{ name: string; category_type: CategoryType; order: number }> = [
        { name: getTranslatedCategoryName('salary'), category_type: 'INCOME', order: 0 },
        { name: getTranslatedCategoryName('rent'), category_type: 'FIXED_EXPENSE', order: 0 },
        { name: getTranslatedCategoryName('healthInsurance'), category_type: 'FIXED_EXPENSE', order: 1 },
        { name: getTranslatedCategoryName('groceries'), category_type: 'VARIABLE_EXPENSE', order: 0 },
        { name: getTranslatedCategoryName('household'), category_type: 'VARIABLE_EXPENSE', order: 1 },
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

      // Create default taxes - use translated names
      const defaultTaxes = [
        { name: getTranslatedTaxName('cantonTaxes'), percentage: '5.00' },
        { name: getTranslatedTaxName('municipalTaxes'), percentage: '2.50' },
        { name: getTranslatedTaxName('federalChurchTaxes'), percentage: '1.00' },
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
        toast.error(t('validation.serverError'))
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
          toast.success(t('createBudget.createdWithTemplate'))
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
        toast.success(t('createBudget.createdWithDefaults'))
      } catch (error: any) {
        console.error('Error creating defaults:', error)
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error'
        toast.error(t('createBudget.errorCreatingDefaults', { error: errorMessage }))
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
      let errorMessage = t('createBudget.errorCreating')
      
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
          errorMessage = t('validation.invalidData')
        } else if (status === 500) {
          errorMessage = t('validation.serverError')
        } else if (status === 404) {
          errorMessage = t('validation.apiNotFound')
        } else {
          errorMessage = t('validation.serverErrorWithStatus', { status })
        }
      } else if (error?.request) {
        // Request was made but no response received
        errorMessage = t('validation.noBackendConnection')
      } else if (error?.message) {
        // Network error or other error
        if (error.message.includes('HTML instead of JSON') || error.isHtmlResponse) {
          errorMessage = t('validation.backendNotReachable')
        } else if (error.message.includes('Network Error') || error.message.includes('ERR_NETWORK')) {
          errorMessage = t('validation.networkError')
        } else if (error.message.includes('timeout')) {
          errorMessage = t('validation.timeout')
        } else {
          errorMessage = `${t('common.error')}: ${error.message}`
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
      toast.success(t('budget.deleted'))
    },
    onError: () => {
      toast.error(t('budget.errorDeleting'))
    },
  })

  const handleCreate = () => {
    if (newBudgetName.trim()) {
      createMutation.mutate({
        name: newBudgetName,
        currency: 'CHF',
      })
    } else {
      toast.error(t('createBudget.enterName'))
    }
  }

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(t('budget.confirmDelete', { name }))) {
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
      
      toast.success(t('budget.exported'))
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(t('budget.errorExporting'))
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Store the budget name for error recovery (available in catch block)
    let importedBudgetName: string | null = null

    try {
      const text = await file.text()
      let data: BudgetSummaryData
      
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        console.error('JSON parse error:', parseError)
        toast.error(t('validation.invalidJson'))
        return
      }
      
      // Validate the data structure
      if (!data.budget) {
        toast.error(t('validation.missingBudgetObject'))
        return
      }
      
      if (!data.categories || !Array.isArray(data.categories)) {
        toast.error(t('validation.missingCategoriesArray'))
        return
      }
      
      if (!data.budget.name) {
        toast.error(t('validation.missingBudgetName'))
        return
      }
      
      if (!data.budget.currency) {
        toast.error(t('validation.missingCurrency'))
        return
      }

      // Store name for error recovery
      importedBudgetName = data.budget.name
      
      // Import the budget
      const response = await budgetApi.import(data)
      const newBudget = response.data
      
      if (!newBudget || !newBudget.id) {
        throw new Error('Import succeeded but budget ID not found in response')
      }
      
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      
      // Small delay to ensure database transaction is fully committed
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Refetch budgets to ensure UI is updated
      await queryClient.refetchQueries({ queryKey: ['budgets'] })
      
      // Wait a bit more to ensure the query cache is updated
      await new Promise(resolve => setTimeout(resolve, 100))
      
      toast.success(t('budget.imported'))
      navigate(`/budget/${newBudget.id}`)
    } catch (error: any) {
      console.error('Import error:', error)
      
      // Check if we got an HTML error page (BrokenPipeError from Django)
      const responseData = error.response?.data
      const isHtmlError = typeof responseData === 'string' && 
        (responseData.includes('<!DOCTYPE') || responseData.includes('BrokenPipeError'))
      
      if (isHtmlError && importedBudgetName) {
        // Wait a moment for the database to settle
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Check if the budget was actually created by looking for it in the list
        try {
          const budgetsResponse = await budgetApi.getAll()
          const existingBudgets = budgetsResponse.data.results || []
          
          // Look for a budget with the imported name (or with timestamp suffix)
          const newBudget = existingBudgets.find((b: Budget) => 
            b.name === importedBudgetName || 
            b.name.startsWith(`${importedBudgetName} (Import `)
          )
          
          if (newBudget) {
            queryClient.invalidateQueries({ queryKey: ['budgets'] })
            toast.success(t('budget.imported'))
            navigate(`/budget/${newBudget.id}`)
            return
          }
        } catch (checkError) {
          console.error('Error checking if import succeeded:', checkError)
        }
        
        // If we couldn't find the budget, show a helpful message
        toast.error(t('budget.importConnectionBroken'))
        queryClient.invalidateQueries({ queryKey: ['budgets'] })
        return
      }
      
      // Extract detailed error message for non-HTML errors
      let errorMessage = t('budget.errorImporting')
      
      if (error.response?.data) {
        const errorData = error.response.data
        
        // Handle Django REST Framework error format
        if (typeof errorData === 'object') {
          // Check for non-field errors
          if (errorData.non_field_errors) {
            errorMessage = t('validation.importError', { error: Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors.join(', ') : errorData.non_field_errors })
          }
          // Check for field-specific errors
          else if (errorData.message) {
            errorMessage = t('validation.importError', { error: errorData.message })
          }
          // Check for serializer validation errors
          else {
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
              .join('; ')
            if (fieldErrors) {
              errorMessage = t('validation.validationError', { errors: fieldErrors })
            }
          }
        } else if (typeof errorData === 'string' && !isHtmlError) {
          errorMessage = t('validation.importError', { error: errorData })
        }
      } else if (error.message) {
        errorMessage = t('validation.importError', { error: error.message })
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
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('dashboard.loadingBudgets')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
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
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">{t('dashboard.errorLoadingBudgets')}</p>
          {isNetworkError ? (
            <>
              <p className="text-base text-slate-700 dark:text-slate-300 mb-4 font-semibold">
                {t('dashboard.backendNotReachable')}
              </p>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-6 text-left bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                <p className="mb-2">{t('dashboard.possibleCauses')}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t('dashboard.backendNotStarted')}</li>
                  <li>{t('dashboard.serverNotOnPort')}</li>
                  <li>{t('dashboard.firewallBlocking')}</li>
                  <li>{t('dashboard.pythonMissing')}</li>
                </ul>
                <p className="mt-4 mb-2">{t('dashboard.pleaseCheck')}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t('dashboard.consoleOutput')}</li>
                  <li>{t('dashboard.backendStarted')}</li>
                  <li>{t('dashboard.logsForErrors')}</li>
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
            {t('common.retry')}
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
              {t('dashboard.title')}
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              {t('dashboard.subtitle')}
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
            {t('dashboard.createBudget')}
          </button>
          <button
            onClick={handleImportClick}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium flex items-center gap-2 text-sm"
          >
            <span className="text-base">📥</span>
            {t('dashboard.importBudget')}
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
            {t('createBudget.title')}
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('createBudget.nameLabel')}
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
                placeholder={t('createBudget.namePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('createBudget.templateLabel')}
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
                <option value="">{t('createBudget.noTemplate')}</option>
                {templatesData?.map((template: BudgetTemplate) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({t('createBudget.templateCategories', { count: template.categories.length })})
                  </option>
                ))}
              </select>
              {selectedTemplateId && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  💡 {t('createBudget.templateHint')}
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
                    {t('createBudget.creating')}
                  </span>
                ) : (
                  t('common.create')
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
                {t('common.cancel')}
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
            {t('dashboard.noBudgets')}
          </h3>
          <p className="text-base text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            {t('dashboard.createFirst')}
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium inline-flex items-center gap-2 text-sm"
          >
            <span className="text-base">+</span>
            {t('dashboard.createFirstBudget')}
          </button>
        </div>
      )}
    </div>
  )
}

export default BudgetDashboard
