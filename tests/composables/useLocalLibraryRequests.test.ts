import { describe, expect, it } from 'vitest'

import { useLocalLibraryRequests } from '@/composables/local-library/useLocalLibraryRequests'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

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
