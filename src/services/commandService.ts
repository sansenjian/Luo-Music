import { COMMANDS, COMMAND_ENABLEMENT } from '@/core/commands/commands'
import { EventEmitter, type Event } from '@/base/common/event/event'
import { DisposableStore } from '@/base/common/lifecycle/disposable'
import { usePlayerStore } from '@/store/playerStore'
import { useSearchStore } from '@/store/searchStore'
import { toPlayMode } from '@/store/player/playerPersistence'
import { getService } from './registry'
import type { ContextKeyService } from './contextKeyService'
import type { PlatformService } from './platformService'
import { IContextKeyService, IPlatformService } from './types'

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
  dispose(): void
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

type SetVolumePayload = {
  volume: number
}

type SetMutePayload = {
  muted: boolean
}

type SetPlayModePayload = {
  mode: number
}

type SearchAndPlayPayload = {
  query: string
}

const DEFAULT_VOLUME_STEP = 0.1
const DEFAULT_SEEK_SECONDS = 5

export type CommandServiceDeps = {
  contextKeyService: Pick<ContextKeyService, 'contextMatchesRules' | 'onDidChangeContext'>
  platformService: Pick<PlatformService, 'toggleDesktopLyric'>
  getPlayerStore?: typeof usePlayerStore
}

function getDefaultCommandServiceDeps(): CommandServiceDeps {
  return {
    contextKeyService: getService(IContextKeyService),
    platformService: getService(IPlatformService),
    getPlayerStore: usePlayerStore
  }
}

export function createCommandService(
  deps: CommandServiceDeps = getDefaultCommandServiceDeps()
): CommandService {
  const handlers = new Map<string, RegisteredCommand>()
  const { contextKeyService, platformService } = deps
  const getPlayerStore = deps.getPlayerStore ?? usePlayerStore
  const enablementEmitter = new EventEmitter<{ id?: string }>()
  const disposables = new DisposableStore()

  disposables.add(
    contextKeyService.onDidChangeContext(() => {
      enablementEmitter.fire({})
    })
  )

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

  register(
    COMMANDS.PLAYER_TOGGLE_PLAY,
    () => {
      getPlayerStore().togglePlay()
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_TOGGLE_PLAY]
    }
  )

  register(
    COMMANDS.PLAYER_PLAY_PREV,
    () => {
      getPlayerStore().playPrev()
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_PLAY_PREV]
    }
  )

  register(
    COMMANDS.PLAYER_PLAY_NEXT,
    () => {
      getPlayerStore().playNext()
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_PLAY_NEXT]
    }
  )

  register(
    COMMANDS.PLAYER_TOGGLE_PLAY_MODE,
    () => {
      getPlayerStore().togglePlayMode()
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_TOGGLE_PLAY_MODE]
    }
  )

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

  register<SeekPayload>(
    COMMANDS.PLAYER_SEEK_FORWARD,
    payload => {
      const playerStore = getPlayerStore()
      const seconds = payload?.seconds ?? DEFAULT_SEEK_SECONDS
      playerStore.seek(Math.min(playerStore.duration, playerStore.progress + seconds))
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_SEEK_FORWARD]
    }
  )

  register<SeekPayload>(
    COMMANDS.PLAYER_SEEK_BACK,
    payload => {
      const playerStore = getPlayerStore()
      const seconds = payload?.seconds ?? DEFAULT_SEEK_SECONDS
      playerStore.seek(Math.max(0, playerStore.progress - seconds))
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.PLAYER_SEEK_BACK]
    }
  )

  register<SetVolumePayload>(COMMANDS.PLAYER_SET_VOLUME, payload => {
    const volume = payload?.volume
    if (typeof volume !== 'number' || !Number.isFinite(volume)) {
      throw new Error('[CommandService] PLAYER_SET_VOLUME requires a numeric volume')
    }
    getPlayerStore().setVolume(Math.max(0, Math.min(1, volume)))
  })

  register<SetMutePayload>(COMMANDS.PLAYER_SET_MUTE, payload => {
    const muted = payload?.muted
    if (typeof muted !== 'boolean') {
      throw new Error('[CommandService] PLAYER_SET_MUTE requires a boolean muted')
    }
    getPlayerStore().setMuted(muted)
  })

  register<SetPlayModePayload>(COMMANDS.PLAYER_SET_PLAY_MODE, payload => {
    const mode = payload?.mode
    if (typeof mode !== 'number' || !Number.isFinite(mode)) {
      throw new Error('[CommandService] PLAYER_SET_PLAY_MODE requires a numeric mode')
    }
    getPlayerStore().setPlayMode(toPlayMode(mode))
  })

  register<SearchAndPlayPayload>(COMMANDS.PLAYER_SEARCH_AND_PLAY, async payload => {
    const query = payload?.query
    if (!query || typeof query !== 'string') {
      throw new Error('[CommandService] PLAYER_SEARCH_AND_PLAY requires a query string')
    }
    const searchStore = useSearchStore()
    await searchStore.search(query)
    if (searchStore.results.length === 0) {
      throw new Error(`[CommandService] No song found for query: ${query}`)
    }
    await searchStore.playResult(0)
  })

  register(COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED, () => {
    getPlayerStore().togglePlayerDocked()
  })

  register(
    COMMANDS.DESKTOP_LYRIC_TOGGLE,
    async () => {
      await platformService.toggleDesktopLyric()
    },
    {
      enablement: COMMAND_ENABLEMENT[COMMANDS.DESKTOP_LYRIC_TOGGLE]
    }
  )

  return {
    onDidChangeCommandEnablement: enablementEmitter.event as Event<{ id?: string }>,
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
    },
    dispose(): void {
      handlers.clear()
      disposables.dispose()
      enablementEmitter.dispose()
    }
  }
}
