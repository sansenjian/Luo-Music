import type { PluginCategory } from '@plugin-sdk'
import type { PlatformCapabilities, PlatformDescriptor } from '@shared/types/platform'

export function getPluginCategory(platform: { category?: PluginCategory }): PluginCategory {
  return platform.category ?? 'api'
}

export function statusClass(status?: PlatformDescriptor['status']): string {
  switch (status) {
    case 'ready':
      return 'plugin-status-ready'
    case 'disabled':
      return 'plugin-status-disabled'
    case 'error':
      return 'plugin-status-error'
    case 'circuit-tripped':
      return 'plugin-status-circuit'
    default:
      return 'plugin-status-ready'
  }
}

export function statusLabel(status?: PlatformDescriptor['status']): string {
  switch (status) {
    case 'ready':
      return '运行中'
    case 'disabled':
      return '已停用'
    case 'error':
      return '异常'
    case 'circuit-tripped':
      return '已熔断'
    default:
      return '运行中'
  }
}

export function sourceLabel(source: PlatformDescriptor['source']): string {
  return source === 'builtin' ? '第一方' : source === 'external' ? '第三方' : source
}

function capabilityCount(platform: { capabilities: PlatformCapabilities }): number {
  const baseCount = Object.entries(platform.capabilities).filter(
    ([key, value]) => key !== 'auth' && value === true
  ).length

  return baseCount + (platform.capabilities.auth?.login ? 1 : 0)
}

export function capabilityLabel(platform: {
  capabilities: PlatformCapabilities
  category?: PluginCategory
}): string {
  const count = capabilityCount(platform)
  if (count === 0 && getPluginCategory(platform) === 'extension') {
    return '拓展功能'
  }

  if (count === 0 && getPluginCategory(platform) === 'theme') {
    return '主题能力'
  }

  return `${count} 项能力`
}
