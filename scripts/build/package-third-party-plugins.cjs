const fsSync = require('node:fs')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')
const path = require('node:path')
const { Transform, Writable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const zlib = require('node:zlib')

const projectRoot = path.resolve(__dirname, '..', '..')
const DEFAULT_SOURCE_DIR = 'plugins/third-party'
const DEFAULT_OUTPUT_DIR = 'out/third-party-plugins'
const DEFAULT_ZIP_ENTRY_DATE = new Date(Date.UTC(2024, 0, 1, 0, 0, 0))
const CACHE_FILE_NAME = '.plugin-package-cache.json'
const OUTPUT_ROOT = path.join(projectRoot, 'out')

function parseArgs(argv) {
  const options = {
    sourceDir: DEFAULT_SOURCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--source-dir') {
      options.sourceDir = argv[index + 1] ?? options.sourceDir
      index += 1
      continue
    }

    if (argument === '--out-dir') {
      options.outputDir = argv[index + 1] ?? options.outputDir
      index += 1
    }
  }

  return options
}

function resolveProjectPath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath)
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function toArchiveNameSegment(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9._+-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveArchiveName(pluginDirectoryName, manifest) {
  const baseName =
    toArchiveNameSegment(manifest.platformId) ||
    toArchiveNameSegment(manifest.id) ||
    toArchiveNameSegment(pluginDirectoryName)
  const version = toArchiveNameSegment(manifest.version)

  return version ? `${baseName}-${version}.zip` : `${baseName}.zip`
}

let crc32Table

function getCrc32Table() {
  if (crc32Table) {
    return crc32Table
  }

  crc32Table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    crc32Table[index] = value >>> 0
  }

  return crc32Table
}

function updateCrc32(value, buffer) {
  const table = getCrc32Table()

  for (const byte of buffer) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8)
  }

  return value >>> 0
}

function toDosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))

  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  }
}

function assertZipSize(value, label) {
  if (value > 0xffffffff) {
    throw new Error(`${label} is too large for standard zip output`)
  }
}

function assertSafeOutputDirectory(outputDir, sourceDir) {
  const resolvedOutputDir = path.resolve(outputDir)
  const resolvedSourceDir = path.resolve(sourceDir)

  if (!isPathInside(OUTPUT_ROOT, resolvedOutputDir) || resolvedOutputDir === OUTPUT_ROOT) {
    throw new Error(`Plugin package output directory must stay inside ${OUTPUT_ROOT}`)
  }

  if (isPathInside(resolvedOutputDir, resolvedSourceDir)) {
    throw new Error('Plugin package output directory must not contain the plugin source directory')
  }

  if (isPathInside(resolvedSourceDir, resolvedOutputDir)) {
    throw new Error(
      'Plugin package output directory must not be inside the plugin source directory'
    )
  }
}

async function collectFiles(sourceDir, currentDir = sourceDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentDir, entry.name)
    const stat = await fs.stat(absolutePath)

    if (stat.isDirectory()) {
      files.push(...(await collectFiles(sourceDir, absolutePath)))
      continue
    }

    if (!stat.isFile()) {
      continue
    }

    const relativePath = path.relative(sourceDir, absolutePath).replace(/\\/g, '/')
    files.push({
      absolutePath,
      relativePath,
      stat
    })
  }

  return files
}

async function createDirectoryFingerprint(sourceDir) {
  const files = await collectFiles(sourceDir)
  const hash = crypto.createHash('sha256')

  for (const file of files) {
    hash.update(file.relativePath)
    hash.update('\0')

    for await (const chunk of fsSync.createReadStream(file.absolutePath)) {
      hash.update(chunk)
    }

    hash.update('\0')
  }

  return hash.digest('hex')
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function endWritableStream(stream) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      cleanup()
      reject(error)
    }
    const onFinish = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      stream.off('error', onError)
      stream.off('finish', onFinish)
    }

    stream.once('error', onError)
    stream.once('finish', onFinish)
    stream.end()
  })
}

function destroyWritableStream(stream) {
  return new Promise(resolve => {
    if (stream.closed) {
      resolve()
      return
    }

    stream.once('close', resolve)
    if (!stream.destroyed) {
      stream.destroy()
    }
  })
}

function createOutputProxy(output) {
  return new Writable({
    write(chunk, encoding, callback) {
      output.write(chunk, encoding, callback)
    }
  })
}

function createCrc32Transform(onComplete) {
  let checksum = 0xffffffff
  let size = 0

  return new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      checksum = updateCrc32(checksum, buffer)
      size += buffer.length
      callback(null, buffer)
    },
    flush(callback) {
      onComplete({
        checksum: (checksum ^ 0xffffffff) >>> 0,
        size
      })
      callback()
    }
  })
}

function createSizeTransform(onComplete) {
  let size = 0

  return new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      callback(null, buffer)
    },
    flush(callback) {
      onComplete(size)
      callback()
    }
  })
}

async function writeZipEntry(output, file, offset, options = {}) {
  const name = Buffer.from(file.relativePath, 'utf-8')
  const { date, time } = toDosDateTime(options.entryDate ?? file.stat.mtime)
  const localHeader = Buffer.alloc(30)
  const flags = 0x0808
  let entryInfo = null
  let compressedSize = 0

  if (name.length > 0xffff) {
    throw new Error(`Zip entry name is too long: ${file.relativePath}`)
  }
  assertZipSize(offset, 'Zip entry offset')

  localHeader.writeUInt32LE(0x04034b50, 0)
  localHeader.writeUInt16LE(20, 4)
  localHeader.writeUInt16LE(flags, 6)
  localHeader.writeUInt16LE(8, 8)
  localHeader.writeUInt16LE(time, 10)
  localHeader.writeUInt16LE(date, 12)
  localHeader.writeUInt32LE(0, 14)
  localHeader.writeUInt32LE(0, 18)
  localHeader.writeUInt32LE(0, 22)
  localHeader.writeUInt16LE(name.length, 26)
  localHeader.writeUInt16LE(0, 28)

  await writeChunk(output, localHeader)
  await writeChunk(output, name)

  await pipeline(
    fsSync.createReadStream(file.absolutePath),
    createCrc32Transform(info => {
      entryInfo = info
    }),
    zlib.createDeflateRaw(),
    createSizeTransform(size => {
      compressedSize = size
    }),
    createOutputProxy(output)
  )

  if (!entryInfo) {
    throw new Error(`Failed to read zip entry: ${file.relativePath}`)
  }

  assertZipSize(entryInfo.size, `${file.relativePath} uncompressed size`)
  assertZipSize(compressedSize, `${file.relativePath} compressed size`)

  const dataDescriptor = Buffer.alloc(16)
  dataDescriptor.writeUInt32LE(0x08074b50, 0)
  dataDescriptor.writeUInt32LE(entryInfo.checksum, 4)
  dataDescriptor.writeUInt32LE(compressedSize, 8)
  dataDescriptor.writeUInt32LE(entryInfo.size, 12)
  await writeChunk(output, dataDescriptor)

  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0)
  centralHeader.writeUInt16LE(20, 4)
  centralHeader.writeUInt16LE(20, 6)
  centralHeader.writeUInt16LE(flags, 8)
  centralHeader.writeUInt16LE(8, 10)
  centralHeader.writeUInt16LE(time, 12)
  centralHeader.writeUInt16LE(date, 14)
  centralHeader.writeUInt32LE(entryInfo.checksum, 16)
  centralHeader.writeUInt32LE(compressedSize, 20)
  centralHeader.writeUInt32LE(entryInfo.size, 24)
  centralHeader.writeUInt16LE(name.length, 28)
  centralHeader.writeUInt16LE(0, 30)
  centralHeader.writeUInt16LE(0, 32)
  centralHeader.writeUInt16LE(0, 34)
  centralHeader.writeUInt16LE(0, 36)
  centralHeader.writeUInt32LE(0, 38)
  centralHeader.writeUInt32LE(offset, 42)

  return {
    centralDirectoryChunks: [centralHeader, name],
    nextOffset: offset + localHeader.length + name.length + compressedSize + dataDescriptor.length
  }
}

async function writeZipFromDirectory(sourceDir, output, options = {}) {
  const files = await collectFiles(sourceDir)
  if (files.length > 0xffff) {
    throw new Error('Too many files for standard zip output')
  }

  const centralDirectoryChunks = []
  let offset = 0

  for (const file of files) {
    const entryResult = await writeZipEntry(output, file, offset, options)
    centralDirectoryChunks.push(...entryResult.centralDirectoryChunks)
    offset = entryResult.nextOffset
  }

  const centralDirectoryOffset = offset
  const centralDirectory = Buffer.concat(centralDirectoryChunks)
  assertZipSize(centralDirectoryOffset, 'Zip central directory offset')
  assertZipSize(centralDirectory.length, 'Zip central directory size')

  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(files.length, 8)
  endRecord.writeUInt16LE(files.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(centralDirectoryOffset, 16)
  endRecord.writeUInt16LE(0, 20)

  await writeChunk(output, centralDirectory)
  await writeChunk(output, endRecord)
}

async function readManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))

  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Invalid plugin manifest: ${manifestPath}`)
  }

  if (!manifest.entry || typeof manifest.entry.main !== 'string') {
    throw new Error(`Plugin manifest missing entry.main: ${manifestPath}`)
  }

  for (const fieldName of ['id', 'platformId', 'version']) {
    if (typeof manifest[fieldName] !== 'string' || !manifest[fieldName].trim()) {
      throw new Error(`Plugin manifest missing ${fieldName}: ${manifestPath}`)
    }
  }

  const pluginRoot = path.resolve(pluginDir)
  const entryPath = path.resolve(pluginRoot, manifest.entry.main)
  if (!isPathInside(pluginRoot, entryPath)) {
    throw new Error(`Plugin entry must stay inside the plugin directory: ${manifestPath}`)
  }

  const entryStat = await fs.stat(entryPath).catch(() => null)
  if (!entryStat?.isFile()) {
    throw new Error(`Plugin entry not found: ${manifest.entry.main}`)
  }

  return manifest
}

async function createZipFromDirectory(sourceDir, archivePath, options = {}) {
  await fs.rm(archivePath, { force: true })
  await fs.mkdir(path.dirname(archivePath), { recursive: true })

  const output = fsSync.createWriteStream(archivePath)
  try {
    await writeZipFromDirectory(sourceDir, output, {
      entryDate: DEFAULT_ZIP_ENTRY_DATE,
      ...options
    })
    await endWritableStream(output)
  } catch (error) {
    await destroyWritableStream(output)
    await fs.rm(archivePath, { force: true }).catch(() => {})
    throw error
  }
}

async function readPackageCache(outputDir) {
  const cachePath = path.join(outputDir, CACHE_FILE_NAME)
  const rawCache = await fs.readFile(cachePath, 'utf-8').catch(error => {
    if (error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (!rawCache) {
    return { archives: {} }
  }

  let parsed
  try {
    parsed = JSON.parse(rawCache)
  } catch {
    return { archives: {} }
  }

  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.archives) {
    return { archives: {} }
  }

  return parsed
}

async function writePackageCache(outputDir, cache) {
  const cachePath = path.join(outputDir, CACHE_FILE_NAME)
  const sortedArchives = Object.fromEntries(
    Object.entries(cache.archives).sort(([left], [right]) => left.localeCompare(right))
  )
  const payload = `${JSON.stringify({ version: 1, archives: sortedArchives }, null, 2)}\n`
  const tempPath = `${cachePath}.${process.pid}.tmp`

  await fs.writeFile(tempPath, payload, 'utf-8')
  await fs.rename(tempPath, cachePath)
}

async function removeStaleOutputEntries(outputDir, expectedArchiveNames) {
  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(error => {
    if (error && error.code === 'ENOENT') {
      return []
    }

    throw error
  })

  await Promise.all(
    entries
      .filter(entry => entry.name !== CACHE_FILE_NAME && !expectedArchiveNames.has(entry.name))
      .map(entry => fs.rm(path.join(outputDir, entry.name), { recursive: true, force: true }))
  )
}

async function shouldReuseArchive(archivePath, cachedArchive, fingerprint) {
  if (!cachedArchive || cachedArchive.fingerprint !== fingerprint) {
    return false
  }

  const archiveStat = await fs.stat(archivePath).catch(() => null)
  return Boolean(
    archiveStat?.isFile() &&
    typeof cachedArchive.archiveSize === 'number' &&
    archiveStat.size === cachedArchive.archiveSize
  )
}

async function packageThirdPartyPlugins(options = {}) {
  const sourceDir = resolveProjectPath(options.sourceDir ?? DEFAULT_SOURCE_DIR)
  const outputDir = resolveProjectPath(options.outputDir ?? DEFAULT_OUTPUT_DIR)
  assertSafeOutputDirectory(outputDir, sourceDir)
  const sourceStat = await fs.stat(sourceDir).catch(error => {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Plugin source directory not found: ${sourceDir}`)
    }

    throw error
  })

  if (!sourceStat.isDirectory()) {
    throw new Error(`Plugin source path is not a directory: ${sourceDir}`)
  }

  const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true })

  await fs.mkdir(outputDir, { recursive: true })
  const packageCache = await readPackageCache(outputDir)
  const nextPackageCache = { archives: {} }

  const archives = []
  const archiveNames = new Set()
  const pluginDirectories = sourceEntries
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))

  if (pluginDirectories.length === 0) {
    throw new Error(`No third-party plugin directories found in: ${sourceDir}`)
  }

  for (const entry of pluginDirectories) {
    const pluginDir = path.join(sourceDir, entry.name)
    const manifest = await readManifest(pluginDir)
    const archiveName = resolveArchiveName(entry.name, manifest)
    if (archiveNames.has(archiveName)) {
      throw new Error(`Duplicate plugin archive name: ${archiveName}`)
    }
    archiveNames.add(archiveName)

    const archivePath = path.join(outputDir, archiveName)
    const fingerprint = await createDirectoryFingerprint(pluginDir)
    const cachedArchive = packageCache.archives?.[archiveName]

    if (!(await shouldReuseArchive(archivePath, cachedArchive, fingerprint))) {
      await createZipFromDirectory(pluginDir, archivePath)
    }

    const archiveStat = await fs.stat(archivePath)
    nextPackageCache.archives[archiveName] = {
      archiveSize: archiveStat.size,
      fingerprint,
      id: manifest.id,
      platformId: manifest.platformId,
      version: manifest.version
    }
    archives.push({
      id: manifest.id,
      platformId: manifest.platformId,
      version: manifest.version,
      archivePath
    })
  }

  await removeStaleOutputEntries(outputDir, archiveNames)
  await writePackageCache(outputDir, nextPackageCache)

  return archives
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const archives = await packageThirdPartyPlugins(options)

  console.log(
    `[plugins] Packaged ${archives.length} third-party plugin archive${archives.length === 1 ? '' : 's'} into ${resolveProjectPath(options.outputDir)}`
  )
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      '[plugins] Failed to package third-party plugins:',
      error instanceof Error ? error.stack || error.message : error
    )
    process.exitCode = 1
  })
}

module.exports = {
  CACHE_FILE_NAME,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SOURCE_DIR,
  DEFAULT_ZIP_ENTRY_DATE,
  createZipFromDirectory,
  packageThirdPartyPlugins,
  parseArgs,
  resolveArchiveName
}
