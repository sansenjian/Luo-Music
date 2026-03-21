import { services } from './index'
import type { PlatformService } from './platformService'

export function getPlatformAccessor(): PlatformService {
  return services.platform()
}
