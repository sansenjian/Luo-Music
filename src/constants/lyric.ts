/**
 * 歌词滚动相关常量定义
 *
 * 统一管理歌词自动滚动的时间参数和阈值
 */

/**
 * 用户滚动后恢复自动滚动的延迟时间 (毫秒)
 *
 * 当用户手动滚动歌词区域后，等待此时间后恢复自动滚动
 * 避免用户操作与自动滚动冲突
 */
export const USER_SCROLL_IDLE_DELAY = 900

/**
 * 用户滚动结束防抖时间 (毫秒)
 *
 * 检测用户滚动操作结束后的防抖时间
 */
export const USER_SCROLL_END_DEBOUNCE = 120

/**
 * 程序化滚动保护阈值 (毫秒)
 *
 * 用于检测是否为程序化滚动操作的时间阈值
 */
export const PROGRAMMATIC_SCROLL_GUARD = 380

/**
 * 默认刷新间隔 (毫秒)
 *
 * 歌词位置计算的默认刷新间隔
 */
export const DEFAULT_LYRIC_UPDATE_INTERVAL = 100

/**
 * 播放进度与歌词索引同步的 UI 刷新间隔 (毫秒)
 *
 * 用于主界面歌词高亮和进度联动，较低的间隔可以减少视觉滞后。
 */
export const LYRIC_UI_UPDATE_INTERVAL = DEFAULT_LYRIC_UPDATE_INTERVAL

/**
 * 桌面歌词 IPC 广播间隔 (毫秒)
 *
 * 桌面歌词比主界面更依赖主进程广播，这里保持更高频以减少“慢半拍”。
 */
export const DESKTOP_LYRIC_IPC_INTERVAL = 160
