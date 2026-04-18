import { describe, expect, it } from 'vitest'

import { useHomeWorkspaceState } from '@/composables/useHomeWorkspaceState'

describe('useHomeWorkspaceState', () => {
  it('switches the workspace to recent play when the history sidebar item is selected', () => {
    const state = useHomeWorkspaceState()

    state.handleSidebarItemSelect('history')

    expect(state.activeWorkspaceView.value).toBe('history')
    expect(state.activeSidebarItemId.value).toBe('history')
  })

  it('resets any selected collection when switching to the recent-play workspace', () => {
    const state = useHomeWorkspaceState()

    state.handleSidebarCollectionSelect({
      uiId: 'collection-1',
      sourceId: '1',
      kind: 'playlist',
      name: 'My Collection',
      coverUrl: '',
      summary: ''
    })
    state.handleSidebarItemSelect('history')

    expect(state.selectedCollection.value).toBeNull()
    expect(state.activeWorkspaceView.value).toBe('history')
  })
})
