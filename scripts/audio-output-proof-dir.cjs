const path = require('node:path')

const proofDirEnv = 'LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR'
const proofReportEnv = 'LUO_AUDIO_OUTPUT_WINDOWS_PROOF_REPORT'
const bundleReportEnv = 'LUO_AUDIO_OUTPUT_VERIFICATION_BUNDLE_REPORT'

const reportEnv = {
  remote: 'LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT',
  voicemeeter: 'LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT',
  bitPerfect: 'LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT',
  loopback: 'LUO_AUDIO_OUTPUT_LOOPBACK_REPORT',
  format: 'LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT',
  modeSwitch: 'LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT'
}

const proofDirReportNames = {
  remote: 'remote-refresh.json',
  voicemeeter: 'voicemeeter-route.json',
  bitPerfect: 'candidate.json',
  loopback: 'candidate-plus-loopback.json',
  format: 'format-matrix-win32.json',
  modeSwitch: 'mode-switch.json',
  report: 'audio-output-verification-bundle.json'
}

function resolvePath(value) {
  return value ? path.resolve(value) : undefined
}

function resolveProofDirPath(proofDir, reportName) {
  return proofDir ? path.join(proofDir, reportName) : undefined
}

function resolveProofDirReportPath(type, env = process.env) {
  const reportName = proofDirReportNames[type]
  if (!reportName) {
    return undefined
  }

  return resolvePath(resolveProofDirPath(resolvePath(env[proofDirEnv]), reportName))
}

function resolveReportPathFromEnv(explicitEnvName, type, env = process.env) {
  const reportPath = env[explicitEnvName] || resolveProofDirReportPath(type, env)
  return reportPath ? path.resolve(reportPath) : null
}

module.exports = {
  bundleReportEnv,
  proofDirEnv,
  proofDirReportNames,
  proofReportEnv,
  reportEnv,
  resolvePath,
  resolveProofDirPath,
  resolveProofDirReportPath,
  resolveReportPathFromEnv
}
