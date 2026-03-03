const pkg = require('@neteasecloudmusicapienhanced/api')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const { serveNcmApi } = pkg
// __dirname 在 CommonJS 中已全局提供，无需声明

// 关键修复：在 Electron 环境中使用 Electron 的可执行文件作为 Node
const isPackaged = process.env.NODE_ENV === 'production'
const nodeCommand = isPackaged ? process.execPath : 'node'

// 设置 NODE_PATH 以确保能找到依赖
if (isPackaged) {
  process.env.NODE_PATH = path.join(__dirname, 'node_modules')
  console.log('NODE_PATH set to:', process.env.NODE_PATH)
}

console.log('\n🎵 LUO Music API 服务启动中...')
console.log('Node command:', nodeCommand)
console.log('Is packaged:', isPackaged)
console.log('Process execPath:', process.execPath)
console.log('__dirname:', __dirname)
console.log('')

// 启动网易云音乐 API
serveNcmApi({
  port: 14532,
  host: 'localhost',
})
  .then(() => {
    console.log('✅ 网易云音乐 API 服务已启动在 http://localhost:14532')
  })
  .catch((err) => {
    console.error('❌ 网易云音乐 API 启动失败:', err.message)
  })

// 启动 QQ 音乐 API（使用正确的 Node 路径）
const qqMusicBaseDir = path.join(__dirname, 'node_modules', '@sansenjian', 'qq-music-api')
const qqMusicPath = path.join(qqMusicBaseDir, 'app.js')

// 检查文件是否存在
if (!fs.existsSync(qqMusicPath)) {
  console.error('❌ QQ 音乐 API 不存在:', qqMusicPath)
  console.log('跳过 QQ 音乐 API 启动')
} else {
  console.log('Starting QQ Music API from:', qqMusicPath)
  console.log('QQ Music base dir:', qqMusicBaseDir)
  
  // 直接运行 app.js，不需要 babel-register（QQ 音乐 API 自己会处理）
  const qqMusicProcess = spawn(nodeCommand, [qqMusicPath], {
    env: {
      ...process.env,
      PORT: '3200',
      HOST: 'localhost',
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production'
    },
    cwd: qqMusicBaseDir,
    shell: process.platform === 'win32',
    windowsHide: true
  })

  console.log('QQ Music spawn args:', [qqMusicPath])
  console.log('QQ Music spawn env:', {
    PORT: '3200',
    HOST: 'localhost',
    ELECTRON_RUN_AS_NODE: '1',
    BABEL_ENV: 'production',
    NODE_ENV: 'production',
    NODE_PATH: process.env.NODE_PATH,
    CWD: qqMusicBaseDir
  })

  qqMusicProcess.stdout.on('data', (data) => {
    const output = data.toString()
    console.log('[QQ Music Output]', output.trim())
    if (output.includes('server running') || output.includes('3200')) {
      console.log('✅ QQ 音乐 API 服务已启动在 http://localhost:3200')
      console.log('\n🎉 所有 API 服务启动完成！\n')
    }
  })

  qqMusicProcess.stderr.on('data', (data) => {
    console.error('[QQ Music Error]', data.toString().trim())
  })

  qqMusicProcess.on('error', (err) => {
    console.error('❌ QQ 音乐 API 启动失败:', err.message)
    console.error('Error code:', err.code)
    console.error('Error syscall:', err.syscall)
    console.log('\n提示：可以继续使用网易云音乐功能\n')
  })

  qqMusicProcess.on('close', (code) => {
    console.log(`⚠️ QQ 音乐 API 进程退出，code: ${code}`)
    if (code !== 0) {
      console.error('⚠️ QQ 音乐 API 非正常退出，可能是启动失败')
    }
  })
}
