import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')

const SOURCE_ROOTS = ['src', 'electron']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs']
const RESOLVE_EXTENSIONS = [...SOURCE_EXTENSIONS, '.d.ts']
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vite',
  '.turbo'
])

const GROUP_RULES = [
  ['src/App.vue', 'src/entry'],
  ['src/main.ts', 'src/entry'],
  ['src/base/', 'src/base'],
  ['src/config/', 'src/config'],
  ['src/core/', 'src/core'],
  ['src/router/', 'src/router'],
  ['src/types/', 'src/types'],
  ['src/views/', 'src/views'],
  ['src/components/', 'src/components'],
  ['src/composables/', 'src/composables'],
  ['src/store/', 'src/store'],
  ['src/services/', 'src/services'],
  ['src/platform/', 'src/platform'],
  ['src/api/', 'src/api'],
  ['src/utils/', 'src/utils'],
  ['electron/main/', 'electron/main'],
  ['electron/ipc/', 'electron/ipc'],
  ['electron/shared/', 'electron/shared'],
  ['electron/sandbox/', 'electron/sandbox'],
  ['electron/utils/', 'electron/utils'],
  ['electron/', 'electron/core']
]

const GROUP_ORDER = [
  'src/views',
  'src/components',
  'src/composables',
  'src/store',
  'src/services',
  'src/platform',
  'src/api',
  'src/utils',
  'src/base',
  'src/config',
  'src/core',
  'src/router',
  'src/types',
  'src/entry',
  'electron/main',
  'electron/ipc',
  'electron/shared',
  'electron/sandbox',
  'electron/utils',
  'electron/core'
]

const CROSS_LAYER_RULES = [
  {
    name: 'UI -> Platform',
    from: new Set(['src/views', 'src/components']),
    to: new Set(['src/platform', 'electron/main', 'electron/ipc', 'electron/core', 'electron/shared'])
  },
  {
    name: 'Store -> UI',
    from: new Set(['src/store']),
    to: new Set(['src/views', 'src/components'])
  },
  {
    name: 'Services -> UI',
    from: new Set(['src/services']),
    to: new Set(['src/views', 'src/components'])
  },
  {
    name: 'Platform -> UI',
    from: new Set(['src/platform']),
    to: new Set(['src/views', 'src/components'])
  }
]

function walkDirectory(dirPath, results) {
  if (!fs.existsSync(dirPath)) {
    return
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      walkDirectory(fullPath, results)
      continue
    }

    if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      continue
    }

    if (entry.name.endsWith('.d.ts')) {
      continue
    }

    results.push(fullPath)
  }
}

function collectSourceFiles() {
  const files = []

  for (const sourceRoot of SOURCE_ROOTS) {
    walkDirectory(path.join(rootDir, sourceRoot), files)
  }

  return files
}

function readImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const importSpecifiers = new Set()
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g
  ]

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      importSpecifiers.add(match[1])
    }
  }

  return [...importSpecifiers]
}

function resolveImport(sourceFile, specifier) {
  let candidateBase = null

  if (specifier.startsWith('@/')) {
    candidateBase = path.join(rootDir, 'src', specifier.slice(2))
  } else if (specifier.startsWith('src/')) {
    candidateBase = path.join(rootDir, specifier)
  } else if (specifier.startsWith('electron/')) {
    candidateBase = path.join(rootDir, specifier)
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    candidateBase = path.resolve(path.dirname(sourceFile), specifier)
  }

  if (!candidateBase) {
    return null
  }

  const candidates = []

  if (path.extname(candidateBase)) {
    candidates.push(candidateBase)
  } else {
    candidates.push(candidateBase)
    for (const extension of RESOLVE_EXTENSIONS) {
      candidates.push(`${candidateBase}${extension}`)
    }

    for (const extension of RESOLVE_EXTENSIONS) {
      candidates.push(path.join(candidateBase, `index${extension}`))
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.normalize(candidate)
    }
  }

  return null
}

function toRelativePath(filePath) {
  return path.relative(rootDir, filePath).replaceAll('\\', '/')
}

function getGroupForFile(filePath) {
  const relativePath = toRelativePath(filePath)

  for (const [prefix, group] of GROUP_RULES) {
    if (relativePath.startsWith(prefix)) {
      return group
    }
  }

  return relativePath.split('/').slice(0, 2).join('/')
}

function createEdgeKey(from, to) {
  return `${from} -> ${to}`
}

function sortGroups(groups) {
  return [...groups].sort((left, right) => {
    const leftIndex = GROUP_ORDER.indexOf(left)
    const rightIndex = GROUP_ORDER.indexOf(right)
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight
    }

    return left.localeCompare(right)
  })
}

function toMermaidId(group) {
  return group.replaceAll('/', '_').replaceAll('-', '_')
}

function collectGraphData() {
  const files = collectSourceFiles()
  const groups = new Set()
  const edgeCounts = new Map()
  const fileEdges = []

  for (const filePath of files) {
    const fromGroup = getGroupForFile(filePath)
    groups.add(fromGroup)

    for (const specifier of readImports(filePath)) {
      const resolvedImport = resolveImport(filePath, specifier)
      if (!resolvedImport) {
        continue
      }

      const toGroup = getGroupForFile(resolvedImport)
      groups.add(toGroup)

      if (fromGroup === toGroup) {
        continue
      }

      const edgeKey = createEdgeKey(fromGroup, toGroup)
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1)
      fileEdges.push({
        fromFile: toRelativePath(filePath),
        toFile: toRelativePath(resolvedImport),
        fromGroup,
        toGroup
      })
    }
  }

  return {
    files,
    groups: sortGroups(groups),
    edgeCounts,
    fileEdges
  }
}

function collectSmells(fileEdges) {
  const matches = []

  for (const edge of fileEdges) {
    for (const rule of CROSS_LAYER_RULES) {
      if (rule.from.has(edge.fromGroup) && rule.to.has(edge.toGroup)) {
        matches.push({
          rule: rule.name,
          ...edge
        })
      }
    }
  }

  return matches
}

function formatTopEdges(edgeCounts) {
  return [...edgeCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, 20)
}

function createMarkdownReport(graphData) {
  const { files, groups, edgeCounts, fileEdges } = graphData
  const topEdges = formatTopEdges(edgeCounts)
  const smells = collectSmells(fileEdges).slice(0, 12)
  const generatedAt = new Date().toISOString()
  const mermaidLines = ['```mermaid', 'graph LR']

  for (const group of groups) {
    mermaidLines.push(`  ${toMermaidId(group)}["${group}"]`)
  }

  for (const { key, count } of topEdges) {
    const [from, to] = key.split(' -> ')
    mermaidLines.push(`  ${toMermaidId(from)} -->|${count}| ${toMermaidId(to)}`)
  }

  mermaidLines.push('```')

  const lines = [
    '# Lightweight Dependency Graph',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Scope',
    '',
    `- Scanned files: ${files.length}`,
    `- Module groups: ${groups.length}`,
    `- Cross-group import edges: ${edgeCounts.size}`,
    '',
    '## Groups',
    ''
  ]

  for (const group of groups) {
    lines.push(`- ${group}`)
  }

  lines.push('', '## Mermaid', '', ...mermaidLines, '', '## Top Cross-Group Edges', '')

  for (const { key, count } of topEdges) {
    lines.push(`- ${key} (${count})`)
  }

  lines.push('', '## Potential Architecture Smells', '')

  if (smells.length === 0) {
    lines.push('- No configured smell rules matched.')
  } else {
    for (const smell of smells) {
      lines.push(
        `- [${smell.rule}] ${smell.fromFile} -> ${smell.toFile} (${smell.fromGroup} -> ${smell.toGroup})`
      )
    }
  }

  return `${lines.join('\n')}\n`
}

function writeReportIfRequested(markdown) {
  const writeIndex = process.argv.indexOf('--write')
  if (writeIndex === -1) {
    return null
  }

  const outputPath = process.argv[writeIndex + 1]
  if (!outputPath) {
    throw new Error('Missing output path after --write')
  }

  const absoluteOutputPath = path.resolve(rootDir, outputPath)
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fs.writeFileSync(absoluteOutputPath, markdown, 'utf8')
  return absoluteOutputPath
}

function main() {
  const graphData = collectGraphData()
  const markdown = createMarkdownReport(graphData)
  const writtenPath = writeReportIfRequested(markdown)

  process.stdout.write(markdown)

  if (writtenPath) {
    process.stdout.write(`\nReport written to ${writtenPath}\n`)
  }
}

main()
