import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function runCommand(command) {
  try {
    return execSync(command, { cwd: rootDir, encoding: 'utf-8' })
  } catch (error) {
    return error.stdout || ''
  }
}

function getPackageJson() {
  const packageJsonPath = path.join(rootDir, 'package.json')
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
}

function analyzeDependencies() {
  log('\n📦 LUO Music 依赖分析报告\n', 'cyan')
  log('='.repeat(60), 'cyan')

  const packageJson = getPackageJson()
  
  // 1. 检查依赖版本
  log('\n📋 1. 主要依赖版本检查', 'blue')
  log('-'.repeat(60), 'blue')
  
  const mainDeps = ['vue', 'vue-router', 'pinia', 'naive-ui', 'axios', 'animejs']
  mainDeps.forEach(dep => {
    const version = packageJson.dependencies[dep] || packageJson.devDependencies[dep]
    if (version) {
      log(`✓ ${dep.padEnd(20)} ${version}`, 'green')
    }
  })

  // 2. 运行 npm audit
  log('\n🔒 2. 安全漏洞检查', 'blue')
  log('-'.repeat(60), 'blue')
  const auditResult = runCommand('npm audit --json')
  try {
    const audit = JSON.parse(auditResult)
    if (audit.metadata && audit.metadata.vulnerabilities) {
      const { critical, high, moderate, low } = audit.metadata.vulnerabilities
      const total = critical + high + moderate + low
      
      if (total === 0) {
        log('✓ 未发现安全漏洞', 'green')
      } else {
        log(`⚠ 发现 ${total} 个安全漏洞:`, 'yellow')
        log(`  严重：${critical} | 高：${high} | 中：${moderate} | 低：${low}`, 'yellow')
        log('\n运行 "npm audit fix" 修复部分漏洞', 'yellow')
      }
    }
  } catch (e) {
    log('✓ 未发现明显安全漏洞', 'green')
  }

  // 3. 检查过时依赖
  log('\n📅 3. 过时依赖检查', 'blue')
  log('-'.repeat(60), 'blue')
  const outdatedResult = runCommand('npm outdated')
  if (outdatedResult.trim()) {
    log('以下依赖有过时版本:', 'yellow')
    log(outdatedResult, 'yellow')
  } else {
    log('✓ 所有依赖都是最新版本', 'green')
  }

  // 4. 检查未使用依赖
  log('\n🔍 4. 未使用依赖检查', 'blue')
  log('-'.repeat(60), 'blue')
  const depcheckResult = runCommand('npx depcheck --ignores=electron,electron-builder,vite-plugin-electron,vite-plugin-electron-renderer')
  if (depcheckResult.includes('No depcheck issue')) {
    log('✓ 未发现未使用的依赖', 'green')
  } else {
    log('⚠ 可能未使用的依赖:', 'yellow')
    log(depcheckResult, 'yellow')
  }

  // 5. 依赖大小分析
  log('\n💾 5. 依赖大小分析', 'blue')
  log('-'.repeat(60), 'blue')
  const packageLockPath = path.join(rootDir, 'package-lock.json')
  if (fs.existsSync(packageLockPath)) {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf-8'))
    const totalSize = Object.keys(packageLock.packages || {}).length
    log(`总依赖数量：${totalSize}`, 'cyan')
    log(`生产依赖：${Object.keys(packageJson.dependencies || {}).length}`, 'cyan')
    log(`开发依赖：${Object.keys(packageJson.devDependencies || {}).length}`, 'cyan')
  }

  // 6. 检查重复依赖
  log('\n🔄 6. 重复依赖检查', 'blue')
  log('-'.repeat(60), 'blue')
  const lsResult = runCommand('npm ls axios')
  const axiosMatches = lsResult.match(/axios@[\d.]+/g) || []
  if (axiosMatches.length > 1) {
    log(`⚠ 发现 axios 有多个版本:`, 'yellow')
    axiosMatches.forEach(v => log(`  - ${v}`, 'yellow'))
    log('\n建议：统一使用最新版本', 'yellow')
  } else {
    log('✓ 未发现明显的重复依赖', 'green')
  }

  // 7. 建议
  log('\n💡 优化建议', 'blue')
  log('-'.repeat(60), 'blue')
  log('1. 定期运行 "npm audit fix" 修复安全漏洞', 'cyan')
  log('2. 使用 "npm run update:deps" 更新依赖版本', 'cyan')
  log('3. 使用 "npm run check:unused" 检查未使用依赖', 'cyan')
  log('4. 使用 "npm run analyze:bundle" 分析打包体积', 'cyan')
  log('5. 考虑使用 vite-plugin-compression 压缩打包文件', 'cyan')
  
  log('\n' + '='.repeat(60), 'cyan')
  log('分析完成!\n', 'green')
}

analyzeDependencies()
