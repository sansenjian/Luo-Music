const { spawnSync: defaultSpawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const audioOutputHelperPathEnv = 'LUO_AUDIO_OUTPUT_HELPER_PATH'

function getAudioOutputHelperFileName(platform = process.platform) {
  return platform === 'win32' ? 'audio-output-helper.exe' : 'audio-output-helper'
}

function getDefaultAudioOutputHelperPath(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'))
  return path.join(
    projectRoot,
    'native',
    'audio-engine',
    'target',
    'debug',
    getAudioOutputHelperFileName(options.platform)
  )
}

function getAudioOutputHelperBuildScriptPath(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'))
  return path.join(projectRoot, 'scripts', 'build', 'build-audio-output-helper.cjs')
}

function resolveAudioOutputHelperPath(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'))
  const env = options.env ?? process.env
  const envValue = env[audioOutputHelperPathEnv]
  const buildScriptPath = getAudioOutputHelperBuildScriptPath({ projectRoot })
  const defaultDebugHelperPath = getDefaultAudioOutputHelperPath({
    projectRoot,
    platform: options.platform
  })

  if (typeof envValue === 'string' && envValue.trim()) {
    return {
      projectRoot,
      buildScriptPath,
      defaultDebugHelperPath,
      envName: audioOutputHelperPathEnv,
      helperPath: path.resolve(projectRoot, envValue.trim()),
      helperPathSource: 'env',
      shouldBuild: false
    }
  }

  return {
    projectRoot,
    buildScriptPath,
    defaultDebugHelperPath,
    envName: audioOutputHelperPathEnv,
    helperPath: defaultDebugHelperPath,
    helperPathSource: 'debug-build',
    shouldBuild: true
  }
}

function assertHelperFileExists(helperInfo) {
  if (!fs.existsSync(helperInfo.helperPath)) {
    const sourceLabel =
      helperInfo.helperPathSource === 'env'
        ? `${helperInfo.envName} helper binary does not exist`
        : 'Helper binary was not built'
    throw new Error(`${sourceLabel}: ${helperInfo.helperPath}`)
  }

  const stat = fs.statSync(helperInfo.helperPath)
  if (!stat.isFile()) {
    throw new Error(`Helper path must be a file: ${helperInfo.helperPath}`)
  }
}

function prepareAudioOutputHelper(options = {}) {
  const helperInfo = resolveAudioOutputHelperPath(options)

  if (helperInfo.shouldBuild) {
    const spawnSync = options.spawnSync ?? defaultSpawnSync
    const buildResult = spawnSync(process.execPath, [helperInfo.buildScriptPath], {
      cwd: helperInfo.projectRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.stdio ?? 'inherit'
    })

    if (buildResult.error) {
      throw new Error(`Failed to start helper build: ${buildResult.error.message}`)
    }
    if (buildResult.status !== 0) {
      throw new Error(`Helper build failed with status ${buildResult.status}`)
    }
  }

  assertHelperFileExists(helperInfo)
  return helperInfo
}

module.exports = {
  audioOutputHelperPathEnv,
  getAudioOutputHelperBuildScriptPath,
  getAudioOutputHelperFileName,
  getDefaultAudioOutputHelperPath,
  prepareAudioOutputHelper,
  resolveAudioOutputHelperPath
}
