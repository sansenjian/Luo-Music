const fs = require('node:fs')
const path = require('node:path')

const projectRoot = process.cwd()
const guardedPairs = [
  ['vite.config.ts', 'vite.config.js'],
  ['electron.vite.config.ts', 'electron.vite.config.js'],
  ['vitest.config.ts', 'vitest.config.js'],
  ['forge.config.ts', 'forge.config.js'],
  ['playwright.config.ts', 'playwright.config.js']
]

const conflictingFiles = guardedPairs.filter(([tsFile, jsFile]) => {
  const tsPath = path.join(projectRoot, tsFile)
  const jsPath = path.join(projectRoot, jsFile)
  return fs.existsSync(tsPath) && fs.existsSync(jsPath)
})

if (conflictingFiles.length === 0) {
  process.exit(0)
}

const lines = conflictingFiles.map(
  ([tsFile, jsFile]) =>
    `- Found both ${tsFile} and ${jsFile}. Remove the generated .js file so tooling loads the TypeScript config.`
)

console.error(
  ['Config shadowing detected.', ...lines, 'Generated JS config artifacts must not live beside the source .ts config files.'].join(
    '\n'
  )
)

process.exit(1)
