import { setupServices } from './index'
import { getService } from './registry'
import type { PlayerService } from './playerService'
import { IPlayerService } from './types'

export function getPlayerAccessor(): PlayerService {
  setupServices()
  return getService(IPlayerService)
}
