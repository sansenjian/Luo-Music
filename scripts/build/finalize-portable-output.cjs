const fs = require('node:fs/promises')
const path = require('node:path')

function resolvePortableOutputDir(customDir) {
  return path.resolve(process.cwd(), customDir || path.join('out', 'portable'))
}

async function finalizePortableOutput(customDir) {
  const outputDir = resolvePortableOutputDir(customDir)
  const entries = await fs.readdir(outputDir, { withFileTypes: true })
  const portableExeEntries = entries.filter(
    entry => entry.isFile() && entry.name.toLowerCase().endsWith('.exe')
  )

  if (portableExeEntries.length !== 1) {
    throw new Error(
      `[portable] Expected exactly one portable exe in ${outputDir}, found ${portableExeEntries.length}`
    )
  }

  const portableExeName = portableExeEntries[0].name

  await Promise.all(
    entries
      .filter(entry => entry.name !== portableExeName)
      .map(entry =>
        fs.rm(path.join(outputDir, entry.name), {
          recursive: true,
          force: true
        })
      )
  )

  return path.join(outputDir, portableExeName)
}

async function main() {
  const portableExePath = await finalizePortableOutput(process.argv[2])
  console.log(`[portable] Ready: ${portableExePath}`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      '[portable] Failed to finalize portable output:',
      error instanceof Error ? error.stack || error.message : error
    )
    process.exitCode = 1
  })
}

module.exports = {
  finalizePortableOutput,
  resolvePortableOutputDir
}
