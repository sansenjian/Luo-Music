import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS } from '@shared/protocol/channels'
import { createDefaultSmtcNativeStatus, type SmtcNativeStatus } from '@shared/smtc/protocol'
import { setSmtcEnabledFromRenderer } from '../../main/smtc'
import { getCurrentPlayerStateSnapshot } from '../../main/playerStateSnapshot'
import type { SmtcNativeService } from '../../main/smtcNativeService'

function createChromiumStatus(enabled: boolean, restartRequired: boolean): SmtcNativeStatus {
  return {
    ...createDefaultSmtcNativeStatus(),
    enabled,
    backend: enabled ? 'chromium' : 'disabled',
    restartRequired
  }
}

export function registerSmtcHandlers(
  nativeService?: Pick<SmtcNativeService, 'getStatus' | 'setEnabled' | 'syncPlayerState'>
): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.SMTC_SET_ENABLED, async (enabled: boolean) => {
    const chromiumState = setSmtcEnabledFromRenderer(enabled)

    if (!nativeService) {
      return createChromiumStatus(enabled, chromiumState.restartRequired)
    }

    const status = await nativeService.setEnabled(enabled, chromiumState.restartRequired)
    if (enabled && status.backend === 'native') {
      nativeService.syncPlayerState(getCurrentPlayerStateSnapshot())
    }
    return status
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SMTC_GET_STATUS, async () => {
    return nativeService?.getStatus() ?? createDefaultSmtcNativeStatus()
  })
}
