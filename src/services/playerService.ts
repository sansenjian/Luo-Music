type ServiceBridge = {
  player?: {
    play?: () => Promise<void> | void
    pause?: () => Promise<void> | void
    toggle?: () => Promise<void> | void
    skipToPrevious?: () => Promise<void> | void
    skipToNext?: () => Promise<void> | void
  }
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export type PlayerService = {
  play(): Promise<void>
  pause(): Promise<void>
  toggle(): Promise<void>
  skipToPrevious(): Promise<void>
  skipToNext(): Promise<void>
}

function getServiceBridge(): ServiceBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as unknown as { services?: ServiceBridge }).services
}

async function callWithInvokeFallback(
  operation: (() => Promise<void> | void) | undefined,
  invokeChannel: string
): Promise<void> {
  try {
    if (typeof operation === 'function') {
      await operation()
      return
    }
  } catch {
    // Fall back to invoke-based IPC below.
  }

  const bridge = getServiceBridge()
  if (typeof bridge?.invoke === 'function') {
    await bridge.invoke(invokeChannel)
  }
}

export function createPlayerService(): PlayerService {
  return {
    play(): Promise<void> {
      return callWithInvokeFallback(getServiceBridge()?.player?.play, 'player:play')
    },

    pause(): Promise<void> {
      return callWithInvokeFallback(getServiceBridge()?.player?.pause, 'player:pause')
    },

    toggle(): Promise<void> {
      return callWithInvokeFallback(getServiceBridge()?.player?.toggle, 'player:toggle')
    },

    skipToPrevious(): Promise<void> {
      return callWithInvokeFallback(
        getServiceBridge()?.player?.skipToPrevious,
        'player:skip-to-previous'
      )
    },

    skipToNext(): Promise<void> {
      return callWithInvokeFallback(getServiceBridge()?.player?.skipToNext, 'player:skip-to-next')
    }
  }
}
