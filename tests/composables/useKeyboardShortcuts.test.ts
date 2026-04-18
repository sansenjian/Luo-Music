import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { COMMANDS } from '@/core/commands/commands'

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

  it('toggles the docked player mode when Tab is pressed outside inputs', () => {
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

    mount(Harness)

    const handler = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined
    expect(handler).toBeDefined()

    const preventDefault = vi.fn()
    handler?.({
      key: 'Tab',
      code: 'Tab',
      ctrlKey: false,
      metaKey: false,
      target: document.body,
      preventDefault
    } as unknown as KeyboardEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(commandService.canExecute).toHaveBeenCalledWith(
      COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED,
      undefined
    )
    expect(commandService.execute).toHaveBeenCalledWith(
      COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED,
      undefined
    )
  })

  it('ignores the Tab shortcut inside editable inputs', () => {
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

    mount(Harness)

    const handler = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined
    const input = document.createElement('input')
    const preventDefault = vi.fn()

    handler?.({
      key: 'Tab',
      code: 'Tab',
      ctrlKey: false,
      metaKey: false,
      target: input,
      preventDefault
    } as unknown as KeyboardEvent)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(commandService.canExecute).not.toHaveBeenCalled()
    expect(commandService.execute).not.toHaveBeenCalled()
  })

  it('blurs editable inputs when Escape is pressed', () => {
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

    mount(Harness)

    const handler = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined
    const input = document.createElement('input')
    const blur = vi.fn()

    input.blur = blur
    handler?.({
      key: 'Escape',
      code: 'Escape',
      ctrlKey: false,
      metaKey: false,
      target: input,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)

    expect(blur).toHaveBeenCalledTimes(1)
    expect(commandService.canExecute).not.toHaveBeenCalled()
    expect(commandService.execute).not.toHaveBeenCalled()
  })

  it('executes previous-track with ctrl/meta arrow-left and seek-forward with plain arrow-right', () => {
    const addEventListener = vi.fn()
    const target = {
      addEventListener,
      removeEventListener: vi.fn()
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

    mount(Harness)

    const handler = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined

    handler?.({
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      ctrlKey: true,
      metaKey: false,
      target: document.body,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)
    handler?.({
      key: 'ArrowRight',
      code: 'ArrowRight',
      ctrlKey: false,
      metaKey: false,
      target: document.body,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)

    expect(commandService.execute).toHaveBeenNthCalledWith(1, COMMANDS.PLAYER_PLAY_PREV, undefined)
    expect(commandService.execute).toHaveBeenNthCalledWith(
      2,
      COMMANDS.PLAYER_SEEK_FORWARD,
      undefined
    )
  })

  it('does not execute matched shortcuts when the command service rejects them', () => {
    const addEventListener = vi.fn()
    const target = {
      addEventListener,
      removeEventListener: vi.fn()
    }
    const commandService = {
      canExecute: vi.fn(() => false),
      execute: vi.fn()
    }

    const Harness = defineComponent({
      setup() {
        useKeyboardShortcuts({ commandService, target })
        return () => null
      }
    })

    mount(Harness)

    const handler = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined
    const preventDefault = vi.fn()

    handler?.({
      key: 'ArrowUp',
      code: 'ArrowUp',
      ctrlKey: false,
      metaKey: false,
      target: document.body,
      preventDefault
    } as unknown as KeyboardEvent)

    expect(commandService.canExecute).toHaveBeenCalledWith(COMMANDS.PLAYER_VOLUME_UP, undefined)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(commandService.execute).not.toHaveBeenCalled()
  })
})
