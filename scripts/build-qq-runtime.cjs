const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')

const projectRoot = process.cwd()
const entryFile = path.join(projectRoot, 'scripts', 'runtime', 'qq-api-server.entry.cjs')
const outputDir = path.join(projectRoot, 'build', 'runtime')
const outputFile = path.join(outputDir, 'qq-api-server.cjs')

async function build() {
  fs.mkdirSync(outputDir, { recursive: true })

  await esbuild.build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node22'],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    external: ['electron']
  })

  console.log(`[build-qq-runtime] Built ${outputFile}`)
}

build().catch(error => {
  console.error('[build-qq-runtime] Failed:', error)
  process.exit(1)
})
