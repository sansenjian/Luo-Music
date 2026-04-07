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
    console.log('[patch-cross-zip] cross-zip already patched or unsupported version')
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
    console.log('[patch-cross-zip] electron-winstaller already patched or unsupported version')
    return
  }

  fs.writeFileSync(filePath, patched, 'utf8')
  console.log('[patch-cross-zip] patched electron-winstaller sign.js guard for DEP0187')
}

patchCrossZip(crossZipPath)
patchElectronWinstallerSign(electronWinstallerSignPath)
