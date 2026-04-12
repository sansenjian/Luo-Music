const fs = require('fs')
const path = require('path')

const crossZipPath = path.join(__dirname, '..', 'node_modules', 'cross-zip', 'index.js')
const electronWinstallerSignPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron-winstaller',
  'lib',
  'sign.js'
)
const appBuilderLibNodeModulesCollectorPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'node-module-collector',
  'nodeModulesCollector.js'
)

function isCiEnvironment() {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI)
}

function handleUnchangedPatch(logMessage) {
  console.log(logMessage)

  if (isCiEnvironment()) {
    throw new Error(`${logMessage} (failing in CI to surface patch drift)`)
  }
}

function patchCrossZip(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('[patch-cross-zip] cross-zip is not installed, skipping')
    return
  }

  const source = fs.readFileSync(filePath, 'utf8')
  const patched = source
    .replace(
      "fs.rmdir(outPath, { recursive: true, maxRetries: 3 }, doZip2)",
      "fs.rm(outPath, { recursive: true, force: true, maxRetries: 3 }, doZip2)"
    )
    .replace(
      "fs.rmdirSync(outPath, { recursive: true, maxRetries: 3 })",
      "fs.rmSync(outPath, { recursive: true, force: true, maxRetries: 3 })"
    )

  if (patched === source) {
    handleUnchangedPatch('[patch-cross-zip] cross-zip already patched or unsupported version')
    return
  }

  fs.writeFileSync(filePath, patched, 'utf8')
  console.log('[patch-cross-zip] patched cross-zip to use fs.rm/fs.rmSync')
}

function patchElectronWinstallerSign(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('[patch-cross-zip] electron-winstaller is not installed, skipping')
    return
  }

  const source = fs.readFileSync(filePath, 'utf8')
  const patched = source.replace(
    'if (!fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];',
    'if (!BACKUP_SIGN_TOOL_PATH || !fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];'
  )

  if (patched === source) {
    handleUnchangedPatch(
      '[patch-cross-zip] electron-winstaller already patched or unsupported version'
    )
    return
  }

  fs.writeFileSync(filePath, patched, 'utf8')
  console.log('[patch-cross-zip] patched electron-winstaller sign.js guard for DEP0187')
}

function patchAppBuilderLibNodeModulesCollector(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('[patch-cross-zip] app-builder-lib is not installed, skipping')
    return
  }

  const source = fs.readFileSync(filePath, 'utf8')
  const originalSnippet = [
    '        await new Promise((resolve, reject) => {',
    '            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);',
    '            const child = childProcess.spawn(command, args, {',
    '                cwd,',
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    '                shell: true, // `true`` is now required: https://github.com/electron-userland/electron-builder/issues/9488',
    '            });'
  ].join('\n')
  const malformedSnippet = [
    '        await new Promise((resolve, reject) => {',
    '            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);',
    '            const quoteForShell = (part) => {',
    '                if (part.length === 0) {',
    '                    return "\\"";',
    '                }',
    '                return /[\\s"]/u.test(part) && !(part.startsWith("\\"") && part.endsWith("\\""))',
    '                    ? "\\\\"${part.replace(/"/g, \'\\\\\\\\\\"\')}\\\\""',
    '                    : part;',
    '            };',
    '            const shellCommand = [command, ...args].map(quoteForShell).join(" ");',
    '            const child = childProcess.spawn(shellCommand, [], {',
    '                cwd,',
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    '                shell: true, // electron-builder currently requires shell mode here, so pass a single shell command string to avoid DEP0190',
    '            });'
  ].join('\n')
  const unsafePatchedSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const quoteForShell = (part) => {",
    "                if (part.length === 0) {",
    "                    return '\"\"';",
    "                }",
    "                if (!(part.startsWith('\"') && part.endsWith('\"')) && /[\\s\"]/u.test(part)) {",
    "                    const escapedPart = part.replace(/\"/g, '\\\\\"');",
    "                    return `\"${escapedPart}\"`;",
    "                }",
    "                return part;",
    "            };",
    "            const shellCommand = [command, ...args].map(quoteForShell).join(\" \");",
    "            const child = childProcess.spawn(shellCommand, [], {",
    "                cwd,",
    "                env: { COREPACK_ENABLE_STRICT: \"0\", ...process.env }, // allow `process.env` overrides",
    "                shell: true, // electron-builder currently requires shell mode here, so pass a single shell command string to avoid DEP0190",
    "            });"
  ].join('\n')
  const safeSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const child = childProcess.spawn(command, args, {",
    "                cwd,",
    "                env: { COREPACK_ENABLE_STRICT: \"0\", ...process.env }, // allow `process.env` overrides",
    "                shell: false, // pass argv directly to avoid shell-escaping bugs and injection risks",
    "            });"
  ].join('\n')

  const patched = source
    .replace(originalSnippet, safeSnippet)
    .replace(malformedSnippet, safeSnippet)
    .replace(unsafePatchedSnippet, safeSnippet)

  if (patched === source) {
    handleUnchangedPatch('[patch-cross-zip] app-builder-lib already patched or unsupported version')
    return
  }

  fs.writeFileSync(filePath, patched, 'utf8')
  console.log('[patch-cross-zip] patched app-builder-lib nodeModulesCollector for DEP0190')
}

function main() {
  patchCrossZip(crossZipPath)
  patchElectronWinstallerSign(electronWinstallerSignPath)
  patchAppBuilderLibNodeModulesCollector(appBuilderLibNodeModulesCollectorPath)
}

if (require.main === module) {
  main()
}

module.exports = {
  handleUnchangedPatch,
  isCiEnvironment,
  main,
  patchAppBuilderLibNodeModulesCollector,
  patchCrossZip,
  patchElectronWinstallerSign
}
