import { setupServices } from './index'
import { getService } from './registry'
import type { PlatformService } from './platformService'
import { IPlatformService } from './types'

export function getPlatformAccessor(): PlatformService {
  setupServices()
  return getService(IPlatformService)
}
