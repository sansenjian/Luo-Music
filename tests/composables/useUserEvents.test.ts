import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserEventMock = vi.hoisted(() => vi.fn())
const isCanceledRequestErrorMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('@/api/user', () => ({
  getUserEvent: getUserEventMock
}))

vi.mock('@/utils/http/cancelError', () => ({
  isCanceledRequestError: isCanceledRequestErrorMock
}))

import { useUserEvents } from '@/composables/useUserEvents'

describe('useUserEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes loaded events with pre-parsed message text', async () => {
    getUserEventMock.mockResolvedValue({
      events: [
        {
          eventId: 1,
          json: JSON.stringify({ msg: 'parsed message' })
        }
      ]
    })

    const { events, loadEvents } = useUserEvents()
    await loadEvents(1)

    expect(events.value).toEqual([
      {
        eventId: 1,
        json: JSON.stringify({ msg: 'parsed message' }),
        message: 'parsed message'
      }
    ])
  })

  it('returns an empty message when raw event json is invalid', () => {
    const { getEventMsg } = useUserEvents()

    expect(getEventMsg({ json: '{bad json' })).toBe('')
  })

  it('prefers an already normalized message field', () => {
    const { getEventMsg } = useUserEvents()

    expect(
      getEventMsg({
        message: 'normalized message',
        json: JSON.stringify({ msg: 'stale message' })
      })
    ).toBe('normalized message')
  })
})
