import platform from '../platform'
import { COMMANDS, COMMAND_ENABLEMENT } from '../core/commands/commands'
import { usePlayerStore } from '../store/playerStore'
import { getService } from './registry'
import { IContextKeyService } from './types'
import type { Event } from '../base/common/event/event'

export type CommandHandler<TPayload = unknown> = (payload?: TPayload) => void | Promise<void>

export type CommandRegistrationOptions = {
  enablement?: string
}

export type CommandDefinition = {
  id: string
  enablement?: string
}

export type CommandService = {
  readonly onDidChangeCommandEnablement: Event<{ id?: string }>
  execute<TPayload = unknown>(id: string, payload?: TPayload): Promise<void>
  canExecute<TPayload = unknown>(id: string, payload?: TPayload): boolean
  register<TPayload = unknown>(
    id: string,
    handler: CommandHandler<TPayload>,
    options?: CommandRegistrationOptions
  ): () => void
  get(id: string): CommandDefinition | undefined
  has(id: string): boolean
  list(): string[]
}

type RegisteredCommand = {
  handler: CommandHandler
  enablement?: string
}

type StepPayload = {
  step?: number
}

type SeekPayload = {
  seconds?: number
}

const DEFAULT_VOLUME_STEP = 0.1
const DEFAULT_SEEK_SECONDS = 5

function createEmitter<T>() {
  const listeners = new Set<(event: T) => void>()
  return {
    event: ((listener: (event: T) => void) => {
      listeners.add(listener)
      return {
        dispose: () => {
          listeners.delete(listener)
        }
      }
    }) as Event<T>,
    fire: (event: T) => {
      for (const listener of [...listeners]) {
        listener(event)
      }
    }
  }
}

export function createCommandService(): CommandService {
  const handlers = new Map<string, RegisteredCommand>()
  const contextKeyService = getService(IContextKeyService)
  const enablementEmitter = createEmitter<{ id?: string }>()

  contextKeyService.onDidChangeContext(() => {
    enablementEmitter.fire({})
  })

  const register = <TPayload = unknown>(
    id: string,
    handler: CommandHandler<TPayload>,
    options: CommandRegistrationOptions = {}
  ): (() => void) => {
    handlers.set(id, {
      handler: handler as CommandHandler,
      enablement: options.enablement
    })
    enablementEmitter.fire({ id })

    return () => {
      const current = handlers.get(id)
      if (current?.handler === handler) {
        handlers.delete(id)
        enablementEmitter.fire({ id })
      }
    }
  }

  const canExecute = <TPayload = unknown>(id: string, _payload?: TPayload): boolean => {
    const command = handlers.get(id)
    if (!command) {
      return false
    }

    return contextKeyService.contextMatchesRules(command.enablement)
  }

  const execute = async <TPayload = unknown>(id: string, payload?: TPayload): Promise<void> => {
    const command = handlers.get(id)

    if (!command) {
      throw new Error(`[CommandService] Command "${id}" is not registered`)
    }

    if (!canExecute(id, payload)) {
      throw new Error(`[CommandService] Command "${id}" is currently disabled`)
    }

    await command.handler(payload)
  }

  const getPlayerStore = () => usePlayerStore()

  register(COMMANDS.PLAYER_TOGGLE_PLAY, () => {
    getPlayerStore().togglePlay()
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_TOGGLE_PLAY]
  })

  register(COMMANDS.PLAYER_PLAY_PREV, () => {
    getPlayerStore().playPrev()
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_PLAY_PREV]
  })

  register(COMMANDS.PLAYER_PLAY_NEXT, () => {
    getPlayerStore().playNext()
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_PLAY_NEXT]
  })

  register(COMMANDS.PLAYER_TOGGLE_PLAY_MODE, () => {
    getPlayerStore().togglePlayMode()
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_TOGGLE_PLAY_MODE]
  })

  register<StepPayload>(COMMANDS.PLAYER_VOLUME_UP, payload => {
    const playerStore = getPlayerStore()
    const step = payload?.step ?? DEFAULT_VOLUME_STEP
    playerStore.setVolume(Math.min(1, playerStore.volume + step))
  })

  register<StepPayload>(COMMANDS.PLAYER_VOLUME_DOWN, payload => {
    const playerStore = getPlayerStore()
    const step = payload?.step ?? DEFAULT_VOLUME_STEP
    playerStore.setVolume(Math.max(0, playerStore.volume - step))
  })

  register<SeekPayload>(COMMANDS.PLAYER_SEEK_FORWARD, payload => {
    const playerStore = getPlayerStore()
    const seconds = payload?.seconds ?? DEFAULT_SEEK_SECONDS
    playerStore.seek(Math.min(playerStore.duration, playerStore.progress + seconds))
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_SEEK_FORWARD]
  })

  register<SeekPayload>(COMMANDS.PLAYER_SEEK_BACK, payload => {
    const playerStore = getPlayerStore()
    const seconds = payload?.seconds ?? DEFAULT_SEEK_SECONDS
    playerStore.seek(Math.max(0, playerStore.progress - seconds))
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_SEEK_BACK]
  })

  register(COMMANDS.PLAYER_TOGGLE_COMPACT_MODE, () => {
    getPlayerStore().toggleCompactMode()
  })

  register(COMMANDS.DESKTOP_LYRIC_TOGGLE, () => {
    if (platform.isElectron()) {
      platform.send('toggle-desktop-lyric', undefined)
    }
  }, {
    enablement: COMMAND_ENABLEMENT[COMMANDS.DESKTOP_LYRIC_TOGGLE]
  })

  return {
    onDidChangeCommandEnablement: enablementEmitter.event,
    execute,
    canExecute,
    register,
    get(id: string): CommandDefinition | undefined {
      const command = handlers.get(id)
      return command ? { id, enablement: command.enablement } : undefined
    },
    has(id: string): boolean {
      return handlers.has(id)
    },
    list(): string[] {
      return [...handlers.keys()]
    }
  }
}
