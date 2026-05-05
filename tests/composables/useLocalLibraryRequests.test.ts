import { describe, expect, it } from 'vite-plus/test'

import { useLocalLibraryRequests } from '@/composables/local-library/useLocalLibraryRequests'
import { createDeferred } from '../helpers/deferred'

describe('useLocalLibraryRequests', () => {
  it('keeps mutating true until all concurrent mutations complete', async () => {
    const { mutating, runMutation } = useLocalLibraryRequests()
    const first = createDeferred<string>()
    const second = createDeferred<string>()

    const firstRun = runMutation(() => first.promise)
    const secondRun = runMutation(() => second.promise)

    expect(mutating.value).toBe(true)

    first.resolve('first')
    await firstRun

    expect(mutating.value).toBe(true)

    second.resolve('second')
    await secondRun

    expect(mutating.value).toBe(false)
  })
})
