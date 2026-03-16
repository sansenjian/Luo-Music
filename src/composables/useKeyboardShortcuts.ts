import { onMounted, onUnmounted } from 'vue'

import { DEFAULT_SHORTCUTS } from '../config/shortcuts'
import { COMMANDS } from '../core/commands/commands'
import { services } from '../services'

export function useKeyboardShortcuts(): void {
  const commandService = services.commands()
  const commandMap: Record<string, { id: string; payload?: unknown }> = {
    togglePlay: { id: COMMANDS.PLAYER_TOGGLE_PLAY },
    playPrev: { id: COMMANDS.PLAYER_PLAY_PREV },
    playNext: { id: COMMANDS.PLAYER_PLAY_NEXT },
    volumeUp: { id: COMMANDS.PLAYER_VOLUME_UP },
    volumeDown: { id: COMMANDS.PLAYER_VOLUME_DOWN },
    seekForward: { id: COMMANDS.PLAYER_SEEK_FORWARD },
    seekBack: { id: COMMANDS.PLAYER_SEEK_BACK },
    toggleCompact: { id: COMMANDS.PLAYER_TOGGLE_COMPACT_MODE }
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null
    const isInput = target
      ? ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
      : false

    if (isInput) {
      if (event.key === 'Escape') {
        target?.blur()
      }
      return
    }

    for (const shortcut of DEFAULT_SHORTCUTS) {
      if (!shortcut.keys.includes(event.key) && !shortcut.keys.includes(event.code)) {
        continue
      }

      const needsCtrlOrMeta = shortcut.modifiers?.includes('ctrlOrMeta')
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey

      if (needsCtrlOrMeta && !hasCtrlOrMeta) {
        continue
      }

      if (!needsCtrlOrMeta && hasCtrlOrMeta) {
        continue
      }

      const command = commandMap[shortcut.action]
      if (command) {
        if (!commandService.canExecute(command.id, command.payload)) {
          return
        }

        event.preventDefault()
        void commandService.execute(command.id, command.payload)
      }
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
