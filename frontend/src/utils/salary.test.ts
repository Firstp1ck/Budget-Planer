import { describe, expect, it } from 'vitest'
import { isSalaryCategory } from './salary'

describe('salary recognition', () => {
  it.each(['Salary', '  GROSS   salary ', 'Gehalt', 'Bruttogehalt', 'Lohn', 'Bruttolohn', 'categorySuggestions.salary'])(
    'recognizes the supported income name %s', name => {
      expect(isSalaryCategory({ name, category_type: 'INCOME' })).toBe(true)
    },
  )

  it.each(['Salary bonus', '13th Month Salary', 'Gehalt partner', 'Side Income', 'Bonus', ''])('does not infer salary from %s', name => {
    expect(isSalaryCategory({ name, category_type: 'INCOME' })).toBe(false)
  })

  it('never applies salary rules to expense categories', () => {
    expect(isSalaryCategory({ name: 'Salary', category_type: 'FIXED_EXPENSE' })).toBe(false)
  })
})
