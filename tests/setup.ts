import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

import { MockAudio } from './mocks/audio'

vi.stubGlobal('Audio', MockAudio)
if (typeof window !== 'undefined') {
  window.Audio = MockAudio as unknown as typeof Audio
}

beforeEach(() => {
  const pinia = createPinia()
  setActivePinia(pinia)
  config.global.plugins = [pinia]
})
