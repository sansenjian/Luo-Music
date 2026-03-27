import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import EventsView from '../../../src/components/user/EventsView.vue'

describe('EventsView', () => {
  it('renders parsed event messages from json payloads', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 1,
            eventTime: Date.now(),
            json: JSON.stringify({ msg: 'test event message' }),
            user: {
              nickname: 'tester',
              avatarUrl: ''
            },
            song: null
          }
        ]
      }
    })

    expect(wrapper.text()).toContain('test event message')
  })

  it('ignores invalid event json without breaking the list render', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 2,
            eventTime: Date.now(),
            json: '{invalid json',
            user: {
              nickname: 'tester',
              avatarUrl: ''
            },
            song: null
          }
        ]
      }
    })

    expect(wrapper.find('.event-item').exists()).toBe(true)
    expect(wrapper.find('.event-content').exists()).toBe(false)
  })
})
