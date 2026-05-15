import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'

import { MockAudio } from './mocks/audio'

export function installMockAudio() {
  vi.stubGlobal('Audio', MockAudio)
  if (typeof window !== 'undefined') {
    window.Audio = MockAudio as unknown as typeof Audio
  }
}

export function createTestPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
