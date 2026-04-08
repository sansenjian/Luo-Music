import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

describe('useKeyboardShortcuts', () => {
  it('registers and unregisters keydown listeners against the resolved target', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const target = {
      addEventListener,
      removeEventListener
    }
    const commandService = {
      canExecute: vi.fn(() => true),
      execute: vi.fn()
    }

    const Harness = defineComponent({
      setup() {
        useKeyboardShortcuts({ commandService, target })
        return () => null
      }
    })

    const wrapper = mount(Harness)

    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function))

    const handler = addEventListener.mock.calls[0]?.[1]
    wrapper.unmount()

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler)
  })
})
