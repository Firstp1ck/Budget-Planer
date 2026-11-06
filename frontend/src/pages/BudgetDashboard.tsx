import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { budgetApi, templateApi, categoryApi } from '../services/api'
import type { Budget, CategoryType, BudgetSummaryData } from '../types/budget'
import BudgetCard from '../components/BudgetCard'

const panel = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6'
const field = 'w-full min-h-11 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60'
const primary = 'min-h-11 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50'
const secondary = 'min-h-11 px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm disabled:opacity-50'

function BudgetDashboard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [setup, setSetup] = useState('starter')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('updated')
  const [actionError, setActionError] = useState('')
  const [partialBudget, setPartialBudget] = useState<Budget | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [exportingId, setExportingId] = useState<number | null>(null)
  const busyRef = useRef(false)
  const exportingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const { data: budgets, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => (await budgetApi.getAll()).data.results,
    retry: 2,
  })
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await templateApi.getAll()).data.results,
    enabled: isCreating,
  })
  const visibleBudgets = useMemo(() => {
    return (budgets || []).filter(budget => budget.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      const key = sort === 'created' ? 'created_at' : 'updated_at'
      return Date.parse(b[key]) - Date.parse(a[key]) || a.name.localeCompare(b.name)
    })
  }, [budgets, search, sort])

  const resetForm = () => {
    setIsCreating(false)
    setName('')
    setSetup('starter')
    createButtonRef.current?.focus()
  }
  const createMutation = useMutation({
    mutationFn: async ({ budgetName, setupChoice }: { budgetName: string; setupChoice: string }) => {
      const response = await budgetApi.create({ name: budgetName, currency: 'CHF' })
      const budget = response.data
      if (!Number.isInteger(budget?.id) || budget.id <= 0) throw new Error('Uncertain creation result')
      try {
        if (setupChoice === 'starter') {
          const starters: { key: string; category_type: CategoryType; order: number }[] = [
            { key: 'salary', category_type: 'INCOME', order: 0 },
            { key: 'rent', category_type: 'FIXED_EXPENSE', order: 0 },
            { key: 'healthInsurance', category_type: 'FIXED_EXPENSE', order: 1 },
            { key: 'groceries', category_type: 'VARIABLE_EXPENSE', order: 0 },
            { key: 'household', category_type: 'VARIABLE_EXPENSE', order: 1 },
          ]
          for (const { key, ...category } of starters) {
            await categoryApi.create(budget.id, { ...category, name: t(`dashboardUX.starter.${key}`), is_active: true, input_mode: 'MONTHLY', custom_months: null, custom_start_month: null, yearly_amount: null })
          }
        } else if (setupChoice !== 'empty') {
          await templateApi.apply(Number(setupChoice), budget.id)
        }
        return { budget, incomplete: false }
      } catch {
        return { budget, incomplete: true }
      }
    },
    onSuccess: ({ budget, incomplete }) => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
      void queryClient.invalidateQueries({ queryKey: ['budget', budget.id] })
      resetForm()
      if (incomplete) {
        setPartialBudget(budget)
        setActionError(t('dashboardUX.setupFailed', { name: budget.name }))
      } else {
        toast.success(t('createBudget.created'))
        navigate(`/budget/${budget.id}`)
      }
    },
    onError: () => {
      setActionError(t('dashboardUX.createFailed'))
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
    },
    onSettled: () => { busyRef.current = false },
  })
  const isBusy = isImporting || createMutation.isPending
  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success(t('budget.deleted'))
    },
    onError: () => setActionError(t('budget.errorDeleting')),
  })
  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current || !name.trim()) return
    busyRef.current = true
    setActionError('')
    setPartialBudget(null)
    createMutation.mutate({ budgetName: name.trim(), setupChoice: setup })
  }
  const handleDelete = (id: number, budgetName: string) => {
    if (deleteMutation.isPending) return
    if (window.confirm(t('budget.confirmDelete', { name: budgetName }))) deleteMutation.mutate(id)
  }
  const handleExport = async (budgetId: number) => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExportingId(budgetId)
    setActionError('')
    try {
      const { data } = await budgetApi.export(budgetId)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `budget_${data.budget.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success(t('budget.exported'))
    } catch {
      setActionError(t('budget.errorExporting'))
    } finally {
      exportingRef.current = false
      setExportingId(null)
    }
  }
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || busyRef.current) return
    busyRef.current = true
    setIsImporting(true)
    setActionError('')
    setPartialBudget(null)
    let sent = false
    try {
      let data: BudgetSummaryData
      try {
        data = JSON.parse(await file.text())
      } catch {
        setActionError(t('validation.invalidJson'))
        return
      }
      if (!data || typeof data !== 'object' || !data.budget || typeof data.budget.name !== 'string' || !data.budget.name.trim() || !['CHF', 'EUR', 'USD'].includes(data.budget.currency) || !Array.isArray(data.categories) || !Array.isArray(data.entries) || ['tax_entries', 'salary_reductions', 'actual_balances'].some(key => key in data && !Array.isArray(data[key as keyof BudgetSummaryData]))) {
        setActionError(t('dashboardUX.invalidImport'))
        return
      }
      sent = true
      const { data: imported } = await budgetApi.import(data)
      if (!Number.isInteger(imported?.id) || imported.id <= 0) throw new Error('Uncertain import result')
      await queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success(t('budget.imported'))
      navigate(`/budget/${imported.id}`)
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      setActionError(t(sent && (!status || status >= 500) ? 'dashboardUX.importUncertain' : 'dashboardUX.invalidImport'))
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
    } finally {
      busyRef.current = false
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (isLoading && !budgets) return <div role="status" className="py-16 text-center text-slate-600 dark:text-slate-300">{t('dashboard.loadingBudgets')}</div>

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">{t('dashboard.title')}</h1>
        <p className="text-slate-600 dark:text-slate-400">{t('dashboard.subtitle')}</p>
      </div>
      {error && <div role="alert" className={`${panel} mb-5 border-amber-300 dark:border-amber-700`}>
        <p className="text-slate-800 dark:text-slate-200">{t(budgets ? 'dashboardUX.refreshFailed' : 'dashboard.errorLoadingBudgets')}</p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className={`${secondary} mt-3`}>{t('common.retry')}</button>
      </div>}
      {actionError && <div role="alert" className={`${panel} mb-5 border-red-300 dark:border-red-700`}>
        <p className="text-red-700 dark:text-red-300">{actionError}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {partialBudget && <Link to={`/budget/${partialBudget.id}`} className={primary}>{t('dashboardUX.openCreated')}</Link>}
          <button type="button" className={secondary} onClick={() => void refetch()} disabled={isFetching}>{t('dashboardUX.refreshList')}</button>
          <button type="button" className={secondary} onClick={() => setActionError('')}>{t('dashboardUX.dismiss')}</button>
        </div>
      </div>}
      <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" aria-label={t('dashboard.importBudget')} />
      {!isCreating && <div className="mb-6 flex flex-wrap gap-3">
        <button ref={createButtonRef} type="button" onClick={() => { setIsCreating(true); setActionError('') }} disabled={isBusy} className={primary}>+ {t('dashboard.createBudget')}</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isBusy} className={secondary}>{isImporting ? t('dashboardUX.importing') : t('dashboard.importBudget')}</button>
      </div>}
      {isImporting && <p role="status" className="mb-5 text-slate-700 dark:text-slate-300">{t('dashboardUX.importing')}</p>}
      {isCreating && <form onSubmit={handleCreate} onKeyDown={event => { if (event.key === 'Escape' && !busyRef.current) resetForm() }} aria-labelledby="create-budget-title" aria-busy={createMutation.isPending} className={`${panel} mb-6 max-w-2xl`}>
        <h2 id="create-budget-title" className="text-xl font-semibold text-slate-900 dark:text-white mb-5">{t('createBudget.title')}</h2>
        <fieldset disabled={createMutation.isPending} className="space-y-5">
          <div>
            <label htmlFor="budget-name" className="block mb-2 font-medium text-sm text-slate-700 dark:text-slate-300">{t('createBudget.nameLabel')}</label>
            <input id="budget-name" required maxLength={200} autoFocus value={name} onChange={event => setName(event.target.value)} className={field} placeholder={t('createBudget.namePlaceholder')} />
          </div>
          <div>
            <label htmlFor="budget-setup" className="block mb-2 font-medium text-sm text-slate-700 dark:text-slate-300">{t('dashboardUX.setupLabel')}</label>
            <select id="budget-setup" value={setup} onChange={event => setSetup(event.target.value)} aria-describedby="budget-setup-hint" className={field}>
              <option value="starter">{t('dashboardUX.starterOption')}</option>
              <option value="empty">{t('dashboardUX.emptyOption')}</option>
              {templates.data?.map(template => <option key={template.id} value={template.id}>{template.name} ({t('createBudget.templateCategories', { count: template.categories.length })})</option>)}
            </select>
            <p id="budget-setup-hint" className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t(setup === 'starter' ? 'dashboardUX.starterHint' : setup === 'empty' ? 'dashboardUX.emptyHint' : 'createBudget.templateHint')}</p>
            {templates.isLoading && <p role="status" className="text-sm text-slate-500 mt-2">{t('dashboardUX.templatesLoading')}</p>}
            {templates.isError && <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">{t('dashboardUX.templatesFailed')} <button type="button" className="underline min-h-11" onClick={() => void templates.refetch()}>{t('common.retry')}</button></p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={!name.trim() || createMutation.isPending} className={primary}>{createMutation.isPending ? t('createBudget.creating') : t('common.create')}</button>
            <button type="button" onClick={resetForm} className={secondary}>{t('common.cancel')}</button>
          </div>
        </fieldset>
      </form>}
      {!!budgets?.length && <div className={`${panel} mb-6 flex flex-wrap items-end gap-4`}>
        <div className="flex-1 min-w-48">
          <label htmlFor="budget-search" className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">{t('dashboardUX.search')}</label>
          <input id="budget-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className={field} placeholder={t('dashboardUX.searchPlaceholder')} />
        </div>
        <div className="w-full sm:w-auto sm:min-w-48">
          <label htmlFor="budget-sort" className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">{t('dashboardUX.sort')}</label>
          <select id="budget-sort" value={sort} onChange={event => setSort(event.target.value)} className={field}>
            <option value="updated">{t('dashboardUX.sortUpdated')}</option><option value="name">{t('dashboardUX.sortName')}</option><option value="created">{t('dashboardUX.sortCreated')}</option>
          </select>
        </div>
        <p role="status" className="w-full text-sm text-slate-600 dark:text-slate-400">{t('dashboardUX.count', { count: visibleBudgets.length, total: budgets.length })}</p>
      </div>}
      {visibleBudgets.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {visibleBudgets.map(budget => <BudgetCard key={budget.id} budget={budget} onDelete={handleDelete} onExport={handleExport} isDeleting={deleteMutation.isPending && deleteMutation.variables === budget.id} isExporting={exportingId === budget.id} />)}
      </div> : !!budgets?.length ? <div className={`${panel} text-center py-12`}>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{t('dashboardUX.noResults')}</h2><button type="button" className={secondary} onClick={() => setSearch('')}>{t('dashboardUX.clearSearch')}</button>
      </div> : !error && !isCreating && <div className={`${panel} text-center py-12`}>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('dashboard.noBudgets')}</h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto mb-5">{t('dashboardUX.firstBudgetHint')}</p>
        <button type="button" disabled={isBusy} onClick={() => setIsCreating(true)} className={primary}>{t('dashboard.createFirstBudget')}</button>
      </div>}
    </div>
  )
}

export default BudgetDashboard
