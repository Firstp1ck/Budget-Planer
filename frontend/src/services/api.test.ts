import { afterEach, describe, expect, it, vi } from 'vitest'
import api, { budgetApi, templateApi } from './api'

afterEach(() => vi.restoreAllMocks())

describe('complete budget and template retrieval', () => {
  it.each([['/budgets/', () => budgetApi.getAll()], ['/templates/', () => templateApi.getAll()]] as const)('follows every %s page without dropping search results', async (path, getAll) => {
    const request = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: { count: 2, results: [{ id: 1 }], next: `http://localhost:8000/api${path}?page=2`, previous: null } })
      .mockResolvedValueOnce({ data: { count: 2, results: [{ id: 2 }], next: null, previous: 'page1' } })
    const response = await getAll()
    expect(request).toHaveBeenNthCalledWith(2, path, { params: { page: '2' } })
    expect(response.data.results.map(row => row.id)).toEqual([1, 2])
    expect(response.data.next).toBeNull()
  })

  it('rejects looping pagination instead of hanging', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { results: [], next: '/api/budgets/?page=2' } })
    await expect(budgetApi.getAll()).rejects.toThrow('repeated pagination')
  })
})
