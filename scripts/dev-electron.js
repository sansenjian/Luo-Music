import { spawn } from 'child_process'
import { createServer } from 'vite'

async function startElectron() {
  // 启动 Vite 开发服务器
  const server = await createServer()
  await server.listen()

  const address = server.httpServer.address()
  const url = `http://${address.family === 'IPv6' ? '[::1]' : address.address}:${address.port}`

  console.log(`Vite server running at ${url}`)

  // 设置环境变量并启动 Electron
  const isWindows = process.platform === 'win32'
  const electronCmd = isWindows ? 'npx.cmd' : 'npx'
  const electron = spawn(electronCmd, ['electron', '.'], {
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: url,
    },
  })

  electron.on('close', (code) => {
    server.close()
    process.exit(code)
  })
}

startElectron()
