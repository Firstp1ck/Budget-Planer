import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import LanguageSwitch from './LanguageSwitch'
import i18n from '../i18n'

beforeEach(async () => { await i18n.changeLanguage('de-DE') })

it('switches between German and English and remembers the selection', async () => {
  const user = userEvent.setup()
  render(<LanguageSwitch />)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sprache zu English wechseln' }))
  expect(screen.getByRole('button', { name: 'Switch language to Deutsch' })).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('en-US')
  expect(localStorage.getItem('i18nextLng')).toBe('en-US')
  await user.click(screen.getByRole('button', { name: 'Switch language to Deutsch' }))
  expect(document.documentElement.lang).toBe('de-DE')
})

it('can be operated with the keyboard', async () => {
  const user = userEvent.setup()
  render(<LanguageSwitch />)
  await user.tab()
  expect(screen.getByRole('button')).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(i18n.resolvedLanguage).toBe('en-US')
  await user.keyboard(' ')
  expect(i18n.resolvedLanguage).toBe('de-DE')
})
