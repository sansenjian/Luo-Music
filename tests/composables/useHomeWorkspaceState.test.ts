import { describe, expect, it } from 'vitest'

import { useHomeWorkspaceState } from '@/features/home/composables/useHomeWorkspaceState'

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

  it('navigates backward and forward through workspace selections', () => {
    const state = useHomeWorkspaceState()

    state.handleSidebarItemSelect('liked')
    state.handleSidebarItemSelect('local')

    expect(state.activeWorkspaceView.value).toBe('local')
    expect(state.canNavigateBack.value).toBe(true)
    expect(state.canNavigateForward.value).toBe(false)

    state.navigateBack()

    expect(state.activeWorkspaceView.value).toBe('liked')
    expect(state.canNavigateBack.value).toBe(true)
    expect(state.canNavigateForward.value).toBe(true)

    state.navigateBack()

    expect(state.activeWorkspaceView.value).toBe('home')
    expect(state.canNavigateBack.value).toBe(false)
    expect(state.canNavigateForward.value).toBe(true)

    state.navigateForward()

    expect(state.activeWorkspaceView.value).toBe('liked')
    expect(state.canNavigateBack.value).toBe(true)
    expect(state.canNavigateForward.value).toBe(true)
  })

  it('preserves collection detail entries in workspace history', () => {
    const state = useHomeWorkspaceState()

    state.handleSidebarCollectionSelect({
      uiId: 'collection-1',
      sourceId: '1',
      kind: 'playlist',
      name: 'My Collection',
      coverUrl: '',
      summary: ''
    })
    state.handleSidebarItemSelect('local')
    state.navigateBack()

    expect(state.activeWorkspaceView.value).toBe('collection')
    expect(state.selectedCollection.value?.uiId).toBe('collection-1')
    expect(state.activeSidebarItemId.value).toBe('collection-1')
  })
})
