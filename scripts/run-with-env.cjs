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

function escapeForWindowsCmd(argument) {
  const value = String(argument)

  if (value.length === 0) {
    return '""'
  }

  if (!/[\s"&^|<>()%!]/.test(value)) {
    return value
  }

  return `"${value.replace(/(["^])/g, '^$1')}"`
}

function createSpawnTarget(parts) {
  if (process.platform !== 'win32') {
    return {
      command: parts[0],
      args: parts.slice(1)
    }
  }

  const commandLine = parts.map(escapeForWindowsCmd).join(' ')
  return {
    command: process.env.comspec || 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine]
  }
}

const target = createSpawnTarget(commandParts)

const child = spawn(target.command, target.args, {
  stdio: 'inherit',
  env
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
