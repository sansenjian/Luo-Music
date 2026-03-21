import { services } from './index'
import type { MusicService } from './musicService'

export function getMusicAccessor(): MusicService {
  return services.music()
}
