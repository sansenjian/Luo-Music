import { onMounted, onUnmounted } from 'vue'

import { DEFAULT_SHORTCUTS } from '@/config/shortcuts'
import type { ShortcutConfig } from '@/config/shortcuts.d'
import { COMMANDS, type CommandId } from '@/core/commands/commands'
import { services } from '@/services'
import type { CommandService } from '@/services/commandService'

export type KeyboardShortcutDeps = {
  commandService?: Pick<CommandService, 'canExecute' | 'execute'>
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

type ShortcutCommand = {
  id: CommandId
  payload?: unknown
}

export function useKeyboardShortcuts(deps: KeyboardShortcutDeps = {}): void {
  const commandService = deps.commandService ?? services.commands()
  let target: KeyboardShortcutDeps['target'] | null = null
  const commandMap: Record<ShortcutConfig['action'], ShortcutCommand> = {
    togglePlay: { id: COMMANDS.PLAYER_TOGGLE_PLAY },
    playPrev: { id: COMMANDS.PLAYER_PLAY_PREV },
    playNext: { id: COMMANDS.PLAYER_PLAY_NEXT },
    volumeUp: { id: COMMANDS.PLAYER_VOLUME_UP },
    volumeDown: { id: COMMANDS.PLAYER_VOLUME_DOWN },
    seekForward: { id: COMMANDS.PLAYER_SEEK_FORWARD },
    seekBack: { id: COMMANDS.PLAYER_SEEK_BACK },
    togglePlayerDocked: { id: COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED }
  }

  function resolveEventTarget(event: KeyboardEvent): HTMLElement | null {
    return event.target instanceof HTMLElement ? event.target : null
  }

  function isEditableTarget(targetElement: HTMLElement | null): boolean {
    return targetElement
      ? ['INPUT', 'TEXTAREA'].includes(targetElement.tagName) || targetElement.isContentEditable
      : false
  }

  function handleEditableKeydown(event: KeyboardEvent, targetElement: HTMLElement | null): boolean {
    if (!isEditableTarget(targetElement)) {
      return false
    }

    if (event.key === 'Escape') {
      targetElement?.blur()
    }

    return true
  }

  function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): boolean {
    if (!shortcut.keys.includes(event.key) && !shortcut.keys.includes(event.code)) {
      return false
    }

    const needsCtrlOrMeta = shortcut.modifiers?.includes('ctrlOrMeta')
    const hasCtrlOrMeta = event.ctrlKey || event.metaKey

    if (needsCtrlOrMeta && !hasCtrlOrMeta) {
      return false
    }

    if (!needsCtrlOrMeta && hasCtrlOrMeta) {
      return false
    }

    return true
  }

  function resolveShortcutCommand(shortcut: ShortcutConfig): ShortcutCommand | null {
    return commandMap[shortcut.action] ?? null
  }

  function executeShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): void {
    const command = resolveShortcutCommand(shortcut)
    if (!command) {
      return
    }

    if (!commandService.canExecute(command.id, command.payload)) {
      return
    }

    event.preventDefault()
    void commandService.execute(command.id, command.payload)
  }

  function handleKeydown(event: KeyboardEvent): void {
    const eventTarget = resolveEventTarget(event)
    if (handleEditableKeydown(event, eventTarget)) {
      return
    }

    const matchedShortcut = DEFAULT_SHORTCUTS.find(shortcut => matchesShortcut(event, shortcut))
    if (!matchedShortcut) {
      return
    }

    executeShortcut(event, matchedShortcut)
  }

  onMounted(() => {
    target = deps.target ?? (typeof window !== 'undefined' ? window : null)
    target?.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    target?.removeEventListener('keydown', handleKeydown)
  })
}
