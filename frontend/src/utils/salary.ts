/** Legacy budgets identify salary by name; keep the supported names explicit. */
const SALARY_NAMES = new Set([
  'salary', 'gross salary', 'gehalt', 'bruttogehalt', 'lohn', 'bruttolohn',
  'categorysuggestions.salary',
])

export function isSalaryCategory(category: { name: string; category_type: string }): boolean {
  const name = category.name.trim().replace(/\s+/g, ' ').toLowerCase()
  return category.category_type === 'INCOME' && SALARY_NAMES.has(name)
}
