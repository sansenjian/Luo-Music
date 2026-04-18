import type { LocalLibraryFolder, LocalLibraryScanStatus } from '@/types/localLibrary'
import { createLocalLibraryScanStatus } from '@/types/localLibrary'

export function createIdleLocalLibraryStatus(
  folders: LocalLibraryFolder[],
  discoveredTracks: number,
  overrides: Partial<LocalLibraryScanStatus> = {}
): LocalLibraryScanStatus {
  const enabledFolderCount = folders.filter(folder => folder.enabled).length
  const lastScannedAt = folders.reduce<number | null>((latest, folder) => {
    if (!folder.lastScannedAt) {
      return latest
    }

    return latest === null ? folder.lastScannedAt : Math.max(latest, folder.lastScannedAt)
  }, null)

  let message = '还没有添加本地音乐文件夹'
  if (folders.length > 0 && enabledFolderCount === 0) {
    message = '已停用所有本地音乐文件夹'
  } else if (discoveredTracks > 0) {
    message = `已收录 ${discoveredTracks} 首本地歌曲`
  } else if (enabledFolderCount > 0) {
    message = '当前文件夹内还没有识别到本地音频文件'
  }

  return createLocalLibraryScanStatus({
    phase: 'idle',
    discoveredTracks,
    finishedAt: lastScannedAt,
    message,
    ...overrides
  })
}

export function createLocalLibraryErrorStatus(
  currentStatus: LocalLibraryScanStatus,
  discoveredTracks: number,
  message: string,
  overrides: Partial<LocalLibraryScanStatus> = {}
): LocalLibraryScanStatus {
  return createLocalLibraryScanStatus({
    phase: 'error',
    finishedAt: Date.now(),
    currentFolder: currentStatus.currentFolder,
    discoveredTracks,
    message,
    ...overrides
  })
}
