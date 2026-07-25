import { COMMANDS, COMMAND_ENABLEMENT } from '@/core/commands/commands'
import { EventEmitter, type Event } from '@/base/common/event/event'
import { DisposableStore } from '@/base/common/lifecycle/disposable'
import { usePlayerStore } from '@/store/playerStore'
import { useSearchStore } from '@/store/searchStore'
import { toPlayMode } from '@/store/player/playerPersistence'
import { services } from './index'
import { getService } from './registry'
import type { ContextKeyService } from './contextKeyService'
import type { PlatformService } from './platformService'
import { IContextKeyService, IPlatformService } from './types'

export type CommandHandler<TPayload = unknown> = (
  payload?: TPayload
) => void | Promise<void> | Promise<unknown> | unknown

export type CommandRegistrationOptions = {
  enablement?: string
}

export type CommandDefinition = {
  id: string
  enablement?: string
}

export type CommandService = {
  readonly onDidChangeCommandEnablement: Event<{ id?: string }>
  execute<TPayload = unknown>(id: string, payload?: TPayload): Promise<unknown>
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

type PlatformSearchPayload = {
  platformId: string
  keyword: string
  limit?: number
}

type PlatformGetLyricPayload = {
  platformId: string
  songId: string
}

type PlatformGetPlaylistDetailPayload = {
  platformId: string
  playlistId: string
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

  const execute = async <TPayload = unknown>(id: string, payload?: TPayload): Promise<unknown> => {
    const command = handlers.get(id)

    if (!command) {
      throw new Error(`[CommandService] Command "${id}" is not registered`)
    }

    if (!canExecute(id, payload)) {
      throw new Error(`[CommandService] Command "${id}" is currently disabled`)
    }

    return command.handler(payload)
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
    // 优化3：记住用户当前的搜索平台，搜索播放后恢复
    const userServer = searchStore.server
    try {
      // 优先使用网易云搜索，本地库可能没有用户想播放的歌曲
      searchStore.setServer('netease')
      await searchStore.search(query)
      if (searchStore.results.length === 0) {
        // 网易云没找到，尝试 QQ 音乐
        searchStore.setServer('qq')
        await searchStore.search(query)
      }
      if (searchStore.results.length === 0) {
        throw new Error(`未找到歌曲: ${query}`)
      }
      await searchStore.playResult(0)
    } finally {
      // 恢复用户原来的搜索平台
      if (userServer && userServer !== searchStore.server) {
        searchStore.setServer(userServer)
      }
    }
  })

  // ===== 平台 Agent 命令 =====
  // AI 通过这些命令直接调用音乐平台插件的能力

  register<PlatformSearchPayload>(COMMANDS.PLATFORM_SEARCH, async payload => {
    const { platformId, keyword, limit = 10 } = payload ?? {}
    if (!platformId || !keyword) {
      throw new Error('platform.search 需要 platformId 和 keyword')
    }
    const result = await services.plugins().call(platformId, 'search', { keyword, limit, page: 1 })
    return result
  })

  register<PlatformGetLyricPayload>(COMMANDS.PLATFORM_GET_LYRIC, async payload => {
    const { platformId, songId } = payload ?? {}
    if (!platformId || !songId) {
      throw new Error('platform.getLyric 需要 platformId 和 songId')
    }
    const result = await services.plugins().call(platformId, 'getLyric', { songId })
    return result
  })

  register<PlatformGetPlaylistDetailPayload>(
    COMMANDS.PLATFORM_GET_PLAYLIST_DETAIL,
    async payload => {
      const { platformId, playlistId } = payload ?? {}
      if (!platformId || !playlistId) {
        throw new Error('platform.getPlaylistDetail 需要 platformId 和 playlistId')
      }
      const result = await services.plugins().call(platformId, 'getPlaylistDetail', { playlistId })
      return result
    }
  )

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
