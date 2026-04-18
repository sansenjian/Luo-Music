import type { LocalLibraryViewMode } from '@/types/localLibrary'

export type LocalMusicEmptyStateModel = {
  description: string
  icon: string
  title: string
}

export type LocalMusicSummaryCard = {
  actionLabel: string
  coverUrl: string
  fallbackLabel: string
  id: string
  lines: string[]
  title: string
}

export type LocalMusicViewModeOption = {
  id: LocalLibraryViewMode
  label: string
}
