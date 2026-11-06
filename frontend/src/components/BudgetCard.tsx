import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { budgetApi } from '../services/api'
import type { Budget } from '../types/budget'
import { formatCurrency, type Currency } from '../utils/currency'
import { getDashboardBalance } from '../utils/dashboardBalance'

interface BudgetCardProps {
  budget: Budget
  onDelete: (id: number, name: string) => void
  onExport: (id: number) => void
  isDeleting: boolean
  isExporting?: boolean
}

function BudgetCard({ budget, onDelete, onExport, isDeleting, isExporting = false }: BudgetCardProps) {
  const { t, i18n } = useTranslation()
  const displayCurrency: Currency = ['CHF', 'EUR', 'USD'].includes(budget.currency) ? budget.currency as Currency : 'CHF'
  const { data: summaryData, isError, isLoading, refetch } = useQuery({
    queryKey: ['budget', budget.id, 'summary'],
    queryFn: async () => (await budgetApi.getSummary(budget.id)).data,
  })
  const figure = summaryData ? getDashboardBalance(summaryData) : null
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.resolvedLanguage || i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <article aria-labelledby={`budget-title-${budget.id}`} className="flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-700 p-5 sm:p-6 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-5">
        <h2 id={`budget-title-${budget.id}`} className="text-xl font-bold text-slate-900 dark:text-white break-words min-w-0">
          <Link className="hover:text-blue-600 dark:hover:text-blue-400" to={`/budget/${budget.id}`}>{budget.name}</Link>
        </h2>
        <span className="shrink-0 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-semibold">{displayCurrency}</span>
      </div>
      <div className="mb-5 pb-5 border-b border-slate-200 dark:border-slate-700 min-h-20">
        {figure && <>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{t('dashboardUX.plannedBalance', { year: figure.year })}</p>
          <p className={`text-2xl font-bold break-words ${figure.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {figure.balance > 0 ? '+' : ''}{formatCurrency(figure.balance, displayCurrency)}
          </p>
        </>}
        {isLoading && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{t('common.loading')}</p>}
        {isError && <div className="text-sm text-slate-600 dark:text-slate-400"><p>{t('dashboardUX.balanceUnavailable')}</p><button type="button" className="min-h-11 text-blue-600 dark:text-blue-400 underline" onClick={() => void refetch()}>{t('common.retry')}</button></div>}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link to={`/budget/${budget.id}`} aria-label={t('dashboardUX.openNamed', { name: budget.name })} className="flex-1 min-h-11 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-lg font-medium text-sm">{t('budget.open')}</Link>
        <button type="button" onClick={() => onExport(budget.id)} disabled={isExporting} aria-label={t('dashboardUX.exportNamed', { name: budget.name })} title={t('budget.exportBudget')} className="min-h-11 min-w-11 px-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 disabled:opacity-50">{isExporting ? '…' : '↥'}</button>
        <button type="button" onClick={() => onDelete(budget.id, budget.name)} disabled={isDeleting} aria-label={t('dashboardUX.deleteNamed', { name: budget.name })} title={t('budget.deleteBudget')} className="min-h-11 min-w-11 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 disabled:opacity-50">{isDeleting ? '…' : '×'}</button>
      </div>
      <dl className="grid gap-1 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap justify-between gap-x-2"><dt>{t('budget.createdAt')}</dt><dd>{date(budget.created_at)}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-2"><dt>{t('budget.updatedAt')}</dt><dd>{date(budget.updated_at)}</dd></div>
      </dl>
    </article>
  )
}

export default BudgetCard
