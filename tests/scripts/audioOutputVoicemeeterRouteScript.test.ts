import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const script = readFileSync(
  resolve(process.cwd(), 'scripts/test-audio-output-voicemeeter-route.cjs'),
  'utf8'
)

describe('audio output Voicemeeter route script', () => {
  it('configures Voicemeeter mode and the requested bus', () => {
    expect(script).toContain('mode: "voicemeeter"')
    expect(script).toContain('LUO_AUDIO_OUTPUT_VOICEMEETER_BUS')
    expect(script).toContain('normalizeVoicemeeterBus')
    expect(script).toContain('voicemeeterBus: bus')
  })

  it('requires explicit Remote API route proof for the requested bus', () => {
    expect(script).toContain('remote?.available === true')
    expect(script).toContain('remote.routeApplied === true')
    expect(script).toContain('remote.routeManaged === true')
    expect(script).toContain('normalizeVoicemeeterBus(remote.routeBus) === normalizedRequestedBus')
  })

  it('requires route restore proof before reporting success', () => {
    expect(script).toContain('isVoicemeeterRouteRestored')
    expect(script).toContain('typeof remote.routeApplied === "boolean"')
    expect(script).toContain('remote.routeManaged === false')
    expect(script).toContain('verdict !== "routed-and-restored"')
    expect(script).toContain('restoreStatus')
  })

  it('allows enough time for cold Voicemeeter Remote API auto-launch', () => {
    expect(script).toContain('VOICEMEETER_CONFIGURE_TIMEOUT_MS = 30_000')
    expect(script).toContain('{ timeoutMs: VOICEMEETER_CONFIGURE_TIMEOUT_MS }')
  })

  it('records Remote API output level activity while the test tone is playing', () => {
    expect(script).toContain('isVoicemeeterLevelActivityDetected')
    expect(script).toContain('voicemeeterRemote?.levelProbe')
    expect(script).toContain('probe?.active === true')
    expect(script).toContain('target === "virtualInput"')
    expect(script).toContain('Number.isInteger(probe.strip)')
    expect(script).toContain('probe.maxLevel > probe.threshold')
    expect(script).toContain('levelActivityDetected')
    expect(script).toContain('levelProbe')
    expect(script).toContain('Voicemeeter Remote API output level activity')
  })

  it('records native Voicemeeter playFile startup proof', () => {
    expect(script).toContain('createVoicemeeterPlaybackWavBuffer')
    expect(script).toContain('Math.sin')
    expect(script).toContain('createHash')
    expect(script).toContain('sha256')
    expect(script).toContain('type: "playFile"')
    expect(script).toContain('playbackToken')
    expect(script).toContain('Voicemeeter native playback status')
    expect(script).toContain('requestedMode === "voicemeeter"')
    expect(script).toContain('activeMode === "voicemeeter"')
    expect(script).toContain('nativePlayback')
    expect(script).toContain('nativePlaybackStatus')
    expect(script).toContain('native Voicemeeter playFile startup proof')
  })

  it('prints route and restore proof while requiring manual audibility confirmation', () => {
    expect(script).toContain('proof: "voicemeeter-remote-route-and-restore"')
    expect(script).toContain('LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT')
    expect(script).toContain('resolveReportPathFromEnv')
    expect(script).toContain('"voicemeeter"')
    expect(script).toContain('LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED')
    expect(script).toContain('writeReportIfRequested')
    expect(script).toContain('reportPath: reportPath ?? undefined')
    expect(script).toContain('prepareAudioOutputHelper')
    expect(script).toContain('helperPathSource')
    expect(script).toContain('routeApplied')
    expect(script).toContain('routeManaged')
    expect(script).toContain('routeRestored')
    expect(script).toContain('routeBus')
    expect(script).toContain('remoteKind')
    expect(script).toContain('virtualInputStrip')
    expect(script).toContain('requiresManualAudibilityCheck: true')
    expect(script).toContain('manualAudibilityConfirmed')
    expect(script).toContain('manual confirmation that test tone is heard')
  })
})
