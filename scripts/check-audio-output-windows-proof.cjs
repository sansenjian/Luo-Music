const fs = require('node:fs')
const path = require('node:path')

const { checkVerificationBundle } = require('./check-audio-output-verification-bundle.cjs')
const {
  bundleReportEnv,
  proofDirEnv,
  proofDirReportNames,
  proofReportEnv,
  reportEnv,
  resolvePath,
  resolveProofDirPath
} = require('./audio-output-proof-dir.cjs')

const defaultMinimumFormatSampleCoverageRatio = 0.75

function usage() {
  return [
    'Usage:',
    '  node scripts/check-audio-output-windows-proof.cjs [options]',
    '',
    'Options:',
    `  --proof-dir <dir>         Directory with standard Windows proof reports. Env: ${proofDirEnv}`,
    '  --remote <report.json>    Override remote-refresh report path',
    '  --voicemeeter <report.json> Override Voicemeeter route report path',
    '  --bit-perfect <report.json> Override bit-perfect candidate report path',
    '  --loopback <report.json>  Override candidate-plus-loopback report path',
    '  --format <report.json>    Override Windows format matrix report path. May be repeated',
    '  --min-format-sample-coverage <ratio> Minimum supported-extension sample startup coverage. Default: 0.75',
    '  --require-all-format-samples Require sample startup coverage for every declared supported extension',
    `  --report <report.json>    Save final bundle report. Env: ${proofReportEnv} or ${bundleReportEnv}`,
    '',
    'Default proof-dir file names:',
    `  ${proofDirReportNames.remote}`,
    `  ${proofDirReportNames.voicemeeter}`,
    `  ${proofDirReportNames.bitPerfect}`,
    `  ${proofDirReportNames.loopback}`,
    `  ${proofDirReportNames.format}`,
    '',
    'This wrapper always requires accepted win32 format proof, exclusive remote native playback proof, and does not enable dry-run proof relaxations.'
  ].join('\n')
}

function parseFormatCoverageRatio(value) {
  const raw = String(value || '').trim()
  const parsed = Number.parseFloat(raw.endsWith('%') ? raw.slice(0, -1) : raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid format sample coverage ratio: ${value}`)
  }

  const ratio = raw.endsWith('%') || parsed > 1 ? parsed / 100 : parsed
  if (ratio <= 0 || ratio > 1) {
    throw new Error('Format sample coverage ratio must be greater than 0 and no more than 1.')
  }

  return ratio
}

function parseArgs(argv) {
  const options = {
    format: []
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`)
      }
      index += 1
      return value
    }

    switch (arg) {
      case '--proof-dir':
        options.proofDir = next()
        break
      case '--remote':
        options.remote = next()
        break
      case '--voicemeeter':
        options.voicemeeter = next()
        break
      case '--bit-perfect':
        options.bitPerfect = next()
        break
      case '--loopback':
        options.loopback = next()
        break
      case '--format':
        options.format.push(next())
        break
      case '--min-format-sample-coverage':
        options.minFormatSampleCoverage = parseFormatCoverageRatio(next())
        break
      case '--require-all-format-samples':
        options.requireAllFormatSamples = true
        break
      case '--report':
        options.report = next()
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function resolveReportPath(type, options, env, proofDir) {
  return resolvePath(
    options[type] || env[reportEnv[type]] || resolveProofDirPath(proofDir, proofDirReportNames[type])
  )
}

function resolveWindowsProofOptions(options = {}, env = process.env) {
  const proofDir = resolvePath(options.proofDir || env[proofDirEnv])
  const formatPaths =
    Array.isArray(options.format) && options.format.length > 0
      ? options.format.map(resolvePath).filter(Boolean)
      : [
          resolvePath(
            env[reportEnv.format] ||
              resolveProofDirPath(proofDir, proofDirReportNames.format)
          )
        ].filter(Boolean)
  const reportPath = resolvePath(
    options.report ||
      env[proofReportEnv] ||
      env[bundleReportEnv] ||
      resolveProofDirPath(proofDir, proofDirReportNames.report)
  )

  return {
    proofDir,
    options: {
      remote: resolveReportPath('remote', options, env, proofDir),
      voicemeeter: resolveReportPath('voicemeeter', options, env, proofDir),
      bitPerfect: resolveReportPath('bitPerfect', options, env, proofDir),
      loopback: resolveReportPath('loopback', options, env, proofDir),
      format: formatPaths,
      requiredRemoteNativeMode: 'exclusive',
      requiredFormatPlatforms: ['win32'],
      minFormatSampleCoverage:
        options.minFormatSampleCoverage ?? defaultMinimumFormatSampleCoverageRatio,
      ...(options.requireAllFormatSamples ? { requireAllFormatSamples: true } : {}),
      ...(reportPath ? { report: reportPath } : {})
    }
  }
}

function writeJsonReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

function quotePowerShellValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function createProofDirCommandPrefix(proofDir) {
  const resolvedProofDir = proofDir || 'D:\\Captures\\luo-audio-output'
  return `$env:${proofDirEnv} = ${quotePowerShellValue(resolvedProofDir)}; `
}

function hasAcceptedReport(report, type) {
  return report.reports.some(entry => entry.type === type && entry.accepted === true)
}

function hasRejectedReport(report, type) {
  return report.reports.some(entry => entry.type === type && entry.accepted === false)
}

function hasMissingProofMatching(report, pattern) {
  return report.missingProof.some(reason => pattern.test(reason))
}

function createWindowsProofNextSteps(report, proofDir) {
  if (report.complete) {
    return []
  }

  const proofDirPrefix = createProofDirCommandPrefix(proofDir)
  const nextSteps = []

  if (!hasAcceptedReport(report, 'remote') || hasRejectedReport(report, 'remote')) {
    nextSteps.push({
      type: 'remote',
      title: 'Capture live online native refresh proof in WASAPI exclusive mode',
      command: `${proofDirPrefix}$env:LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK = '1'; $env:LUO_AUDIO_OUTPUT_REMOTE_NATIVE_MODE = 'exclusive'; npm run test:audio-output:remote-refresh`,
      requires: [
        'Set LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL and LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS to a real expired platform URL/header pair.',
        'Set LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL and LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS to the refreshed playable URL/header pair.'
      ]
    })
  }

  if (!hasAcceptedReport(report, 'voicemeeter') || hasRejectedReport(report, 'voicemeeter')) {
    nextSteps.push({
      type: 'voicemeeter',
      title: 'Capture Voicemeeter route, native playback, restore, and audibility proof',
      command: `${proofDirPrefix}$env:LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED = '1'; npm run test:audio-output:voicemeeter-route`,
      requires: [
        'Only set LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED=1 after the test tone is actually heard on the selected bus.',
        'Set LUO_AUDIO_OUTPUT_VOICEMEETER_BUS if the proof should target a bus other than A1.'
      ]
    })
  }

  if (!hasAcceptedReport(report, 'bitPerfect') || hasRejectedReport(report, 'bitPerfect')) {
    nextSteps.push({
      type: 'bitPerfect',
      title: 'Capture a guarded WASAPI exclusive bit-perfect candidate',
      command: `${proofDirPrefix}$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_AUTO_WAV = '1'; $env:LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE = '1'; npm run test:audio-output:bit-perfect`,
      requires: [
        'Use a device whose WASAPI exclusive format can match the generated or selected source WAV.',
        'Keep native playback volume at 100% for the candidate proof.'
      ]
    })
  }

  if (
    !hasAcceptedReport(report, 'loopback') ||
    hasRejectedReport(report, 'loopback') ||
    hasMissingProofMatching(report, /candidate\/loopback|loopback/i)
  ) {
    nextSteps.push({
      type: 'loopback',
      title: 'Compare an independent loopback or DAC capture with the candidate source WAV',
      command: `${proofDirPrefix}npm run test:audio-output:loopback -- --source "<candidate.source.wav>" --capture "<independent-loopback.wav>" --candidate "<candidate.json>"`,
      requires: [
        'Capture the playback externally; source and capture files must not be the same file.',
        'Do not use --allow-format-conversion or --compare-frames for final proof.'
      ]
    })
  }

  if (
    !hasAcceptedReport(report, 'format') ||
    hasRejectedReport(report, 'format') ||
    hasMissingProofMatching(report, /format matrix|format report|format proof/i)
  ) {
    nextSteps.push({
      type: 'format',
      title: 'Capture Windows native format sample startup proof',
      command: `${proofDirPrefix}npm run test:audio-output:format-matrix:ffmpeg-samples`,
      requires: [
        'Keep the generated format-matrix-win32.json with the proof bundle.',
        'Use --require-all-samples only when upgrading from most-format proof to all-format proof.'
      ]
    })
  }

  return nextSteps
}

function runCli(argv = process.argv.slice(2), streams = {}, env = process.env) {
  const stdout = streams.stdout ?? process.stdout
  const stderr = streams.stderr ?? process.stderr

  try {
    const parsed = parseArgs(argv)
    if (parsed.help) {
      stdout.write(`${usage()}\n`)
      return 0
    }

    const { options, proofDir } = resolveWindowsProofOptions(parsed, env)
    const report = checkVerificationBundle(options, {})
    const outputReport = {
      ...report,
      scope: 'windows-native-audio-output-proof',
      requiredFormatPlatforms: ['win32'],
      minimumFormatSampleCoverageRatio: options.minFormatSampleCoverage,
      requireAllFormatSamples: options.requireAllFormatSamples === true,
      ...(proofDir ? { proofDir } : {}),
      ...(options.report ? { reportPath: options.report } : {})
    }
    outputReport.nextSteps = createWindowsProofNextSteps(outputReport, proofDir)

    if (options.report) {
      writeJsonReport(options.report, outputReport)
    }

    stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`)
    return outputReport.complete ? 0 : 2
  } catch (error) {
    stderr.write(`[audio-output-windows-proof] ${error.message}\n`)
    return 1
  }
}

if (require.main === module) {
  process.exitCode = runCli()
}

module.exports = {
  createWindowsProofNextSteps,
  parseArgs,
  proofDirReportNames,
  resolveWindowsProofOptions,
  runCli
}
