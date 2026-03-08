const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

function waitForFreshFile(file, startTime) {
  return new Promise((resolve) => {
    const check = () => {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        if (stat.mtimeMs >= startTime) {
          resolve()
          return
        }
      }
      setTimeout(check, 300)
    }
    check()
  })
}

function waitForPort(port) {
  return new Promise((resolve) => {
    const check = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.on('connect', () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => {
        setTimeout(check, 300)
      })
    }
    check()
  })
}

async function main() {
  const startTime = Date.now()

  await waitForPort(5173)
  await waitForFreshFile('dist-electron/main.cjs', startTime)
  await waitForFreshFile('dist-electron/preload.js', startTime)

  const electronBinary = require('electron')
  const appPath = path.resolve('.')

  const child = spawn(electronBinary, [appPath], {
    stdio: 'inherit',
    shell: false,
    cwd: appPath
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
