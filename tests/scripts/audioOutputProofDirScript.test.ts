import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  proofDirEnv,
  proofDirReportNames,
  reportEnv,
  resolveProofDirReportPath,
  resolveReportPathFromEnv
} = require('../../scripts/audio-output-proof-dir.cjs') as {
  proofDirEnv: string
  proofDirReportNames: Record<string, string>
  reportEnv: Record<string, string>
  resolveProofDirReportPath: (
    type: string,
    env?: Record<string, string | undefined>
  ) => string | undefined
  resolveReportPathFromEnv: (
    explicitEnvName: string,
    type: string,
    env?: Record<string, string | undefined>
  ) => string | null
}

describe('audio output proof directory helper', () => {
  it('keeps the standard Windows proof file names in one place', () => {
    expect(proofDirEnv).toBe('LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR')
    expect(proofDirReportNames).toMatchObject({
      remote: 'remote-refresh.json',
      voicemeeter: 'voicemeeter-route.json',
      bitPerfect: 'candidate.json',
      loopback: 'candidate-plus-loopback.json',
      format: 'format-matrix-win32.json',
      modeSwitch: 'mode-switch.json',
      report: 'audio-output-verification-bundle.json'
    })
    expect(reportEnv).toMatchObject({
      remote: 'LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT',
      voicemeeter: 'LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT',
      bitPerfect: 'LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT',
      loopback: 'LUO_AUDIO_OUTPUT_LOOPBACK_REPORT',
      format: 'LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT',
      modeSwitch: 'LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT'
    })
  })

  it('resolves a report path from the proof directory when no explicit report env is set', () => {
    const proofDir = resolve('D:/Captures/luo-audio-output')

    expect(resolveProofDirReportPath('remote', { [proofDirEnv]: proofDir })).toBe(
      join(proofDir, proofDirReportNames.remote)
    )
    expect(
      resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT', 'remote', {
        [proofDirEnv]: proofDir
      })
    ).toBe(join(proofDir, proofDirReportNames.remote))
  })

  it('lets the explicit script report env override the proof directory fallback', () => {
    const proofDir = resolve('D:/Captures/luo-audio-output')
    const explicitReport = resolve('D:/Captures/custom-remote.json')

    expect(
      resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT', 'remote', {
        [proofDirEnv]: proofDir,
        LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT: explicitReport
      })
    ).toBe(explicitReport)
  })
})
