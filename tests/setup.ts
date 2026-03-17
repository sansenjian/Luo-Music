import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

import { MockAudio } from './mocks/audio'

vi.stubGlobal('Audio', MockAudio)
window.Audio = MockAudio as unknown as typeof Audio

config.global.plugins = []

beforeEach(() => {
  setActivePinia(createPinia())
})
