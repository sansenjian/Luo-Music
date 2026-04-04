const { spawn } = require('node:child_process')

const rawArgs = process.argv.slice(2)
const separatorIndex = rawArgs.indexOf('--')

if (separatorIndex === -1 || separatorIndex === rawArgs.length - 1) {
  console.error('Usage: node scripts/run-with-env.cjs KEY=value [KEY=value ...] -- command [args...]')
  process.exit(1)
}

const envAssignments = rawArgs.slice(0, separatorIndex)
const commandParts = rawArgs.slice(separatorIndex + 1)
const env = { ...process.env }

for (const assignment of envAssignments) {
  const equalsIndex = assignment.indexOf('=')

  if (equalsIndex <= 0) {
    console.error(`Invalid environment assignment: ${assignment}`)
    process.exit(1)
  }

  const key = assignment.slice(0, equalsIndex)
  const value = assignment.slice(equalsIndex + 1)
  env[key] = value
}

const child = spawn(commandParts[0], commandParts.slice(1), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
