import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  LOCAL_LIBRARY_SCANNER_DISABLE_ENV,
  LOCAL_LIBRARY_SCANNER_PATH_ENV,
  getLocalLibraryScannerFileName,
  parseNativeScannerLine,
  resolveLocalLibraryScannerPath
} from '../../electron/local-library/nativeScanner'

describe('localLibrary native scanner bridge', () => {
  it('parses native scanner file messages and ignores terminal messages', () => {
    expect(
      parseNativeScannerLine(
        JSON.stringify({
          type: 'file',
          path: 'D:\\Music\\Song.mp3',
          size: 1024.4,
          modifiedAt: 1234.6
        })
      )
    ).toEqual({
      path: 'D:\\Music\\Song.mp3',
      size: 1024,
      modifiedAt: 1235
    })

    expect(parseNativeScannerLine(JSON.stringify({ type: 'done', count: 1 }))).toBeNull()
  })

  it('resolves explicit scanner paths and respects the disable switch', () => {
    const appPath = 'D:\\Project'
    const explicitScannerPath = 'D:\\Tools\\local-library-scanner.exe'
    const exists = (filePath: string) => filePath === explicitScannerPath

    expect(
      resolveLocalLibraryScannerPath({
        appPath,
        env: {
          [LOCAL_LIBRARY_SCANNER_PATH_ENV]: explicitScannerPath
        },
        exists,
        platform: 'win32'
      })
    ).toBe(explicitScannerPath)

    expect(
      resolveLocalLibraryScannerPath({
        appPath,
        env: {
          [LOCAL_LIBRARY_SCANNER_DISABLE_ENV]: '1',
          [LOCAL_LIBRARY_SCANNER_PATH_ENV]: explicitScannerPath
        },
        exists,
        platform: 'win32'
      })
    ).toBeNull()
  })

  it('prefers packaged native resources in packaged builds', () => {
    const appPath = 'D:\\Project'
    const resourcesPath = 'D:\\Project\\resources'
    const scannerFileName = getLocalLibraryScannerFileName('win32')
    const packagedPath = path.join(resourcesPath, 'native', scannerFileName)
    const exists = (filePath: string) => filePath === packagedPath

    expect(
      resolveLocalLibraryScannerPath({
        appPath,
        exists,
        isPackaged: true,
        platform: 'win32',
        resourcesPath
      })
    ).toBe(packagedPath)
  })
})
