import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 直接复制 preload.js 到 dist-electron/preload.js
copyFileSync(
  join(__dirname, 'electron/preload.js'),
  join(__dirname, 'dist-electron/preload.js')
)

console.log('✓ Copied electron/preload.js to dist-electron/preload.js')

// 创建 dist-electron/public 目录，以防 API 依赖它
const publicDir = join(__dirname, 'dist-electron/public')
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true })
  console.log('✓ Created dist-electron/public directory')
}
