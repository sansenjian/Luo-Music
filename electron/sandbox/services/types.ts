/**
 * Sandbox 服务类型定义
 */

// 从各模块导入类型
import type { IpcProxy } from './ipcProxy'
import type { PlayerProxy } from './playerProxy'
import type { ApiProxy } from './apiProxy'
import type { ConfigProxy } from './configProxy'
import type { WindowProxy } from './windowProxy'
import type { LogProxy } from './logProxy'

/**
 * 服务代理集合接口
 */
export interface ServiceProxies {
  ipc: IpcProxy
  player: PlayerProxy
  api: ApiProxy
  config: ConfigProxy
  log: (module: string) => LogProxy
  window: WindowProxy
}
