const fs = require('node:fs')
const path = require('node:path')

const projectRoot = process.cwd()
const guardedPairs = [
  ['vite.config.ts', 'vite.config.js'],
  ['.config/vite.config.ts', '.config/vite.config.js'],
  ['vite.config.ts', 'vitest.config.js'],
  ['vite.config.ts', '.config/vitest.config.js'],
  ['electron/vite.config.ts', 'electron.vite.config.js'],
  ['electron/forge.config.ts', 'forge.config.js'],
  ['.config/playwright.config.ts', 'playwright.config.js']
]

const conflictingFiles = guardedPairs.filter(([tsFile, jsFile]) => {
  const tsPath = path.join(projectRoot, tsFile)
  const jsPath = path.join(projectRoot, jsFile)
  return fs.existsSync(tsPath) && fs.existsSync(jsPath)
})

if (conflictingFiles.length === 0) {
  process.exit(0)
}

for (const [tsFile, jsFile] of conflictingFiles) {
  const jsPath = path.join(projectRoot, jsFile)
  fs.unlinkSync(jsPath)
  console.warn(`Config shadowing: removed generated ${jsFile} (source is ${tsFile})`)
}

process.exit(0)
