import { services } from './index'
import type { PlayerService } from './playerService'

export function getPlayerAccessor(): PlayerService {
  return services.player()
}
