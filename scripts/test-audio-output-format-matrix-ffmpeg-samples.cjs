const { createHash } = require('node:crypto')
const fs = require('node:fs')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const matrixScriptPath = path.join(projectRoot, 'scripts', 'test-audio-output-format-matrix.cjs')
const sampleBaseUrl = 'https://samples.ffmpeg.org'
const downloadRetryAttempts = 3
const downloadRetryDelayMs = 1_500

const sourceSamples = [
  { fileName: 'sample.aac', sourcePath: 'A-codecs/suite/AAC/sample-aac.aac' },
  { fileName: 'sample.aif', sourcePath: 'A-codecs/libsndfile-samples/aif-pcm16.aif' },
  { fileName: 'sample.ape', sourcePath: 'monkeyaudio/sh3.ape' },
  { fileName: 'sample.caf', sourcePath: 'A-codecs/caf/cameraclick.caf' },
  { fileName: 'sample.flac', sourcePath: 'flac/short.flac' },
  {
    fileName: 'sample.m4a',
    sourcePath: 'A-codecs/lossless/ALAC/quicktime-newcodec-applelosslessaudiocodec.m4a'
  },
  { fileName: 'sample.mka', sourcePath: 'A-codecs/AAC/Major 06 kwestia 03.mka' },
  { fileName: 'sample.mp1', sourcePath: 'A-codecs/mp1-sample.mp1' },
  { fileName: 'sample.mp2', sourcePath: 'archive/all/mp3++mp2++audiotest.mp2' },
  { fileName: 'sample.mp3', sourcePath: 'A-codecs/MP3/ascii.mp3' },
  { fileName: 'sample.ogg', sourcePath: 'ogg/Vorbis/1sec.ogg' },
  { fileName: 'sample.wav', sourcePath: 'A-codecs/libsndfile-samples/wav-pcm16.wav' }
]

const optionalOpusSamples = [
  { fileName: 'sample.opus', sourcePath: 'A-codecs/opus/testvector01.ogg' },
  { fileName: 'sample.webm', sourcePath: 'ffmpeg-bugs/trac/ticket1555/res_silence_then_sound.webm' }
]

const aliasSamples = [
  { fileName: 'sample.aiff', sourceFileName: 'sample.aif' },
  { fileName: 'sample.m2a', sourceFileName: 'sample.mp2' },
  { fileName: 'sample.mpa', sourceFileName: 'sample.mp2' },
  { fileName: 'sample.oga', sourceFileName: 'sample.ogg' }
]

function usage() {
  return [
    'Usage:',
    '  node scripts/test-audio-output-format-matrix-ffmpeg-samples.cjs [options]',
    '',
    'Options:',
    '  --sample-dir <dir>       Directory used to cache downloaded public samples.',
    '                           Env: LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_CACHE_DIR',
    '  --report <report.json>   Save the format matrix report.',
    '                           Env: LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT',
    '  --keep-samples           Keep samples in the default temp directory.',
    '                           Explicit --sample-dir is always kept.',
    '  --include-opus-samples   Also prepare .opus/.webm samples for helper builds',
    '                           compiled with LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus.',
    '  --require-all-samples    Fail unless every helper-declared extension has a started sample.',
    '  --help                   Show this help.',
    '',
    'The script downloads a fixed public FFmpeg samples set, aliases equivalent',
    'containers/extensions, then runs the real sample startup matrix. Use',
    '--require-all-samples to restore the strict full-coverage gate.'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {}

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
      case '--sample-dir':
        options.sampleDir = next()
        break
      case '--report':
        options.report = next()
        break
      case '--keep-samples':
        options.keepSamples = true
        break
      case '--include-opus-samples':
        options.includeOpusSamples = true
        break
      case '--require-all-samples':
        options.requireAllSamples = true
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

function parseBooleanEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function hasCargoFeature(features, featureName) {
  return String(features || '')
    .split(/[,\s]+/)
    .map(feature => feature.trim())
    .filter(Boolean)
    .includes(featureName)
}

function shouldIncludeOpusSamples(options = {}, env = process.env) {
  return Boolean(
    options.includeOpusSamples ||
      parseBooleanEnv(env.LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES) ||
      hasCargoFeature(env.LUO_AUDIO_OUTPUT_HELPER_FEATURES, 'opus') ||
      hasCargoFeature(env.LUO_AUDIO_OUTPUT_HELPER_FEATURES, 'opus-bundled')
  )
}

function getSamplesToPrepare(options = {}) {
  return [
    ...sourceSamples,
    ...(options.includeOpusSamples ? optionalOpusSamples : [])
  ]
}

function sampleUrl(sourcePath) {
  return `${sampleBaseUrl}/${sourcePath.split('/').map(encodeURIComponent).join('/')}`
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function removePartialDownload(outputPath) {
  try {
    fs.rmSync(outputPath, { force: true })
  } catch {
    // Best effort cleanup before a retry. A later write will surface persistent filesystem errors.
  }
}

function downloadFile(url, outputPath, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Too many redirects for ${url}`))
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume()
        const redirectUrl = new URL(response.headers.location, url).href
        downloadFile(redirectUrl, outputPath, redirectCount + 1).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`))
        return
      }

      const output = fs.createWriteStream(outputPath)
      response.pipe(output)
      output.on('finish', () => {
        output.close(resolve)
      })
      output.on('error', reject)
    })

    request.on('error', reject)
    request.setTimeout(60_000, () => {
      request.destroy(new Error(`Timed out downloading ${url}`))
    })
  })
}

async function downloadFileWithRetry(url, outputPath, streams = {}) {
  const stderr = streams.stderr ?? process.stderr

  for (let attempt = 1; attempt <= downloadRetryAttempts; attempt += 1) {
    try {
      await downloadFile(url, outputPath)
      return
    } catch (error) {
      removePartialDownload(outputPath)
      if (attempt >= downloadRetryAttempts) {
        throw error
      }

      stderr.write(
        `[audio-output-format-matrix] download failed (${attempt}/${downloadRetryAttempts}) for ${url}: ${error.message}; retrying\n`
      )
      await delay(downloadRetryDelayMs * attempt)
    }
  }
}

function sha256(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

async function prepareSamples(sampleDir, options = {}) {
  fs.mkdirSync(sampleDir, { recursive: true })
  const manifest = []
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr

  for (const sample of getSamplesToPrepare(options)) {
    const outputPath = path.join(sampleDir, sample.fileName)
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      const url = sampleUrl(sample.sourcePath)
      stdout.write(`[audio-output-format-matrix] downloading ${sample.fileName}\n`)
      await downloadFileWithRetry(url, outputPath, { stderr })
    }
    const stat = fs.statSync(outputPath)
    manifest.push({
      fileName: sample.fileName,
      sourceUrl: sampleUrl(sample.sourcePath),
      byteSize: stat.size,
      sha256: sha256(outputPath)
    })
  }

  for (const alias of aliasSamples) {
    const sourcePath = path.join(sampleDir, alias.sourceFileName)
    const outputPath = path.join(sampleDir, alias.fileName)
    fs.copyFileSync(sourcePath, outputPath)
    const stat = fs.statSync(outputPath)
    manifest.push({
      fileName: alias.fileName,
      sourceFileName: alias.sourceFileName,
      byteSize: stat.size,
      sha256: sha256(outputPath)
    })
  }

  const manifestPath = path.join(sampleDir, 'manifest.json')
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        source: sampleBaseUrl,
        samples: manifest
      },
      null,
      2
    )}\n`
  )

  return { manifest, manifestPath }
}

async function runCli(argv = process.argv.slice(2), env = process.env, streams = {}) {
  const stdout = streams.stdout ?? process.stdout
  const stderr = streams.stderr ?? process.stderr
  const options = parseArgs(argv)

  if (options.help) {
    stdout.write(`${usage()}\n`)
    return 0
  }

  const explicitSampleDir = options.sampleDir || env.LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_CACHE_DIR
  const sampleDir = path.resolve(
    explicitSampleDir || path.join(os.tmpdir(), 'luo-audio-output-ffmpeg-samples')
  )
  const includeOpusSamples = shouldIncludeOpusSamples(options, env)

  try {
    const { manifestPath } = await prepareSamples(sampleDir, {
      includeOpusSamples,
      stdout,
      stderr
    })
    stdout.write(
      `[audio-output-format-matrix] prepared FFmpeg samples in ${sampleDir}\n` +
        `[audio-output-format-matrix] sample manifest: ${manifestPath}\n` +
        (includeOpusSamples
          ? '[audio-output-format-matrix] optional Opus/WebM samples enabled\n'
          : '')
    )

    const matrixEnv = {
      ...env,
      LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR: sampleDir,
      ...(options.requireAllSamples
        ? { LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES: '1' }
        : {}),
      ...(options.report ? { LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT: path.resolve(options.report) } : {})
    }
    const result = spawnSync(process.execPath, [matrixScriptPath], {
      cwd: projectRoot,
      env: matrixEnv,
      shell: false,
      stdio: 'inherit'
    })

    if (!explicitSampleDir && !options.keepSamples) {
      fs.rmSync(sampleDir, { recursive: true, force: true })
    }

    if (result.error) {
      stderr.write(`[audio-output-format-matrix] ${result.error.message}\n`)
      return 1
    }

    return result.status ?? 1
  } catch (error) {
    stderr.write(`[audio-output-format-matrix] ${error.message}\n`)
    return 1
  }
}

if (require.main === module) {
  runCli().then(exitCode => {
    process.exitCode = exitCode
  })
}

module.exports = {
  aliasSamples,
  getSamplesToPrepare,
  optionalOpusSamples,
  parseArgs,
  prepareSamples,
  downloadFileWithRetry,
  runCli,
  shouldIncludeOpusSamples,
  sourceSamples
}
