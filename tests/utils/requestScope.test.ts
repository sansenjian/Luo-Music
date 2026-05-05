import { describe, expect, it } from 'vitest'

import { createLatestRequestController } from '@/utils/http/requestScope'

import { createDeferred } from '../helpers/deferred'

describe('requestScope', () => {
  it('treats superseded work as a canceled request', async () => {
    const controller = createLatestRequestController()
    const deferred = createDeferred<string>()
    const firstTask = controller.start()
    const pending = firstTask.guard(deferred.promise)

    controller.start()
    deferred.resolve('stale-result')

    await expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED',
      name: 'CanceledError',
      reason: 'superseded'
    })
  })

  it('skips stale commits and only lets the latest task mutate state', () => {
    const controller = createLatestRequestController()
    const firstTask = controller.start()
    const secondTask = controller.start()
    const applied: string[] = []

    expect(firstTask.commit(() => applied.push('first'))).toBe(false)
    expect(secondTask.commit(() => applied.push('second'))).toBe(true)
    expect(applied).toEqual(['second'])
  })

  it('marks manual cancellation as a canceled request', async () => {
    const controller = createLatestRequestController()
    const task = controller.start()

    controller.cancel()

    await expect(task.guard(Promise.resolve('done'))).rejects.toMatchObject({
      code: 'ERR_CANCELED',
      name: 'CanceledError',
      reason: 'manual'
    })
    expect(controller.isPending()).toBe(false)
  })
})
