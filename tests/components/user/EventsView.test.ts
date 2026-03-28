import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import EventsView from '../../../src/components/user/EventsView.vue'

describe('EventsView', () => {
  it('renders pre-parsed event messages from the view model', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 1,
            eventTime: Date.now(),
            message: 'test event message',
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

  it('renders the list without requiring raw event json parsing in the component', () => {
    const wrapper = mount(EventsView, {
      props: {
        loading: false,
        events: [
          {
            eventId: 2,
            eventTime: Date.now(),
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
