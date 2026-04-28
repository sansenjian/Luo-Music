import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS } from '@/platform/contracts/protocol/channels'
import { setSmtcEnabledFromRenderer } from '../../main/smtc'

export function registerSmtcHandlers(): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.SMTC_SET_ENABLED, async (enabled: boolean) => {
    return setSmtcEnabledFromRenderer(enabled)
  })
}
