import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createWorkflows, getElectronBundleCleanTargets, runStep } =
  require('../../../scripts/build/run-target.cjs') as {
    createWorkflows: (overrides: Record<string, unknown>) => Record<string, () => Promise<void>>
    getElectronBundleCleanTargets: () => string[]
    runStep: (label: string, task: () => Promise<void> | void) => Promise<void>
  }

type BuildEvent = {
  detail?: unknown
  label: string
  name: string
  tasks?: string[]
}

const electronPackagingTempEnv = {
  TEMP: 'D:\\luo-music-packaging-temp',
  TMP: 'D:\\luo-music-packaging-temp',
  TMPDIR: 'D:\\luo-music-packaging-temp'
}
const createdBuildFixturePaths: string[] = []

function ensureBuildFixturePath(targetPath: string, content = ''): void {
  if (existsSync(targetPath)) {
    return
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, content)
  createdBuildFixturePaths.push(targetPath)
}

function cleanupCreatedBuildFixtures(): void {
  while (createdBuildFixturePaths.length > 0) {
    const targetPath = createdBuildFixturePaths.pop()
    if (targetPath) {
      rmSync(targetPath, { force: true })
    }
  }
}

function createWorkflowHarness() {
  const events: BuildEvent[] = []
  const record = (name: string, label: string, detail?: unknown) => {
    events.push({ detail, label, name })
  }
  const workflows = createWorkflows({
    clean: (targets: string[], options?: Record<string, unknown>) =>
      record('clean', targets.join(','), options),
    getElectronPackagingTempEnv: () => electronPackagingTempEnv,
    getNpmCommandParts: () => ['npm'],
    npmRun: (scriptName: string, args: string[] = [], options?: Record<string, unknown>) =>
      record('npmRun', scriptName, { args, options }),
    npmRunAsync: async (
      scriptName: string,
      args: string[] = [],
      options?: Record<string, unknown>
    ) => record('npmRunAsync', scriptName, { args, options }),
    packageThirdPartyPlugins: async () => record('packageThirdPartyPlugins', 'default'),
    checkArtifactBudgets: async (profiles: string[]) =>
      record('checkArtifactBudgets', profiles.join(',')),
    runNode: (scriptPath: string, args: string[] = []) => record('runNode', scriptPath, args),
    runNodeAsync: async (scriptPath: string, args: string[] = []) =>
      record('runNodeAsync', scriptPath, args),
    runParallel: async (label: string, tasks: Record<string, () => Promise<void>>) => {
      const taskNames = Object.keys(tasks)
      events.push({ label, name: 'parallel', tasks: taskNames })

      for (const taskName of taskNames) {
        await tasks[taskName]()
      }
    },
    runStep: async (label: string, task: () => Promise<void> | void) => {
      record('step', label)
      await task()
    },
    runWithEnvAsync: async (envEntries: string[], commandArgs: string[]) =>
      record('runWithEnvAsync', envEntries.join(' '), commandArgs)
  })

  return { events, workflows }
}

describe('run-target build workflows', () => {
  it('cleans Electron renderer and main bundle outputs without removing service/runtime builds', () => {
    try {
      for (const buildEntry of ['index.html', 'favicon.svg', 'tray.ico']) {
        ensureBuildFixturePath(join(process.cwd(), 'build', buildEntry), buildEntry)
      }

      expect(getElectronBundleCleanTargets()).toEqual(
        expect.arrayContaining(['build/assets', 'build/electron'])
      )
      expect(getElectronBundleCleanTargets()).toEqual(
        expect.arrayContaining(['build/index.html', 'build/favicon.svg', 'build/tray.ico'])
      )
      expect(getElectronBundleCleanTargets()).not.toEqual(
        expect.arrayContaining(['build', 'build/service', 'build/runtime'])
      )
    } finally {
      cleanupCreatedBuildFixtures()
    }
  })

  it.each(['electron', 'package', 'electron-portable', 'make-fast'])(
    'prepares %s by cleaning before packaging third-party plugins in parallel with the Electron bundle',
    async target => {
      const { events, workflows } = createWorkflowHarness()

      await workflows[target]()

      const prepareCleanIndex = events.findIndex(
        event => event.name === 'step' && event.label === `${target}:electron-bundle-clean`
      )
      const prepareEvent = events.find(
        event => event.name === 'parallel' && event.label === `${target}:prepare`
      )
      const prepareIndex = events.findIndex(
        event => event.name === 'parallel' && event.label === `${target}:prepare`
      )
      expect(prepareCleanIndex).toBeGreaterThanOrEqual(0)
      expect(prepareIndex).toBeGreaterThan(prepareCleanIndex)
      expect(prepareEvent?.tasks).toEqual(['electron-bundle', 'package-third-party-plugins'])

      const bundleParallelIndex = events.findIndex(
        event => event.name === 'parallel' && event.label === 'electron-bundle'
      )
      const bundleEvent = events.find(
        event => event.name === 'parallel' && event.label === 'electron-bundle'
      )
      expect(bundleEvent?.tasks).toEqual(
        expect.arrayContaining(['build:smtc-helper', 'build:audio-output-helper'])
      )
      expect(
        events.find(
          event => event.name === 'npmRunAsync' && event.label === 'build:audio-output-helper'
        )?.detail
      ).toMatchObject({
        args: ['--', '--release', '--copy-resource', '--required']
      })
      const pluginPackageIndex = events.findIndex(
        event => event.name === 'packageThirdPartyPlugins'
      )
      expect(bundleParallelIndex).toBeGreaterThanOrEqual(0)
      expect(pluginPackageIndex).toBeGreaterThan(bundleParallelIndex)
    }
  )

  it('keeps package-specific packaging after the shared prepare step', async () => {
    const { events, workflows } = createWorkflowHarness()

    await workflows.package()

    const prepareIndex = events.findIndex(
      event => event.name === 'parallel' && event.label === 'package:prepare'
    )
    const forgeIndex = events.findIndex(
      event => event.name === 'npmRun' && event.label === 'electron-forge'
    )

    expect(prepareIndex).toBeGreaterThanOrEqual(0)
    expect(forgeIndex).toBeGreaterThan(prepareIndex)
  })

  it('uses the packaging temp directory for Electron packaging commands', async () => {
    const { events, workflows } = createWorkflowHarness()

    await workflows.electron()
    await workflows.package()
    await workflows['electron-portable']()

    expect(
      events
        .filter(
          event =>
            (event.name === 'npmRun' && event.label === 'electron-forge') ||
            (event.name === 'npmRun' && event.label === 'electron-builder')
        )
        .map(event => event.detail)
    ).toEqual([
      {
        args: ['--', 'make'],
        options: { env: electronPackagingTempEnv }
      },
      {
        args: ['--', 'package'],
        options: { env: electronPackagingTempEnv }
      },
      {
        args: ['--', '--config', 'electron/builder.portable.cjs', '--publish', 'never'],
        options: { env: electronPackagingTempEnv }
      }
    ])
  })

  it('builds full Electron packaging outputs from a single shared prepare step', async () => {
    const { events, workflows } = createWorkflowHarness()

    await workflows['electron-all']()

    const prepareEvents = events.filter(
      event => event.name === 'parallel' && event.label.endsWith(':prepare')
    )
    expect(prepareEvents).toEqual([
      {
        label: 'electron-all:prepare',
        name: 'parallel',
        tasks: ['electron-bundle', 'package-third-party-plugins']
      }
    ])
    const prepareCleanIndex = events.findIndex(
      event => event.name === 'step' && event.label === 'electron-all:electron-bundle-clean'
    )
    const prepareIndex = events.findIndex(
      event => event.name === 'parallel' && event.label === 'electron-all:prepare'
    )
    expect(prepareIndex).toBeGreaterThan(prepareCleanIndex)

    const packageEvent = events.find(
      event => event.name === 'parallel' && event.label === 'electron-all:package'
    )
    expect(packageEvent?.tasks).toEqual(['electron-forge:make', 'electron-builder:portable'])
    expect(
      events
        .filter(
          event =>
            (event.name === 'npmRunAsync' && event.label === 'electron-forge') ||
            (event.name === 'npmRunAsync' && event.label === 'electron-builder')
        )
        .map(event => event.detail)
    ).toEqual([
      {
        args: ['--', 'make'],
        options: { env: electronPackagingTempEnv }
      },
      {
        args: ['--', '--config', 'electron/builder.portable.cjs', '--publish', 'never'],
        options: { env: electronPackagingTempEnv }
      }
    ])
    const budgetEvent = events.find(
      event =>
        event.name === 'checkArtifactBudgets' && event.label === 'bundle,plugins,electron,portable'
    )
    expect(budgetEvent).toBeDefined()
  })

  it('checks artifact budgets after package workflows complete', async () => {
    const { events, workflows } = createWorkflowHarness()

    await workflows['electron-portable']()

    const finalizeIndex = events.findIndex(
      event =>
        event.name === 'runNode' && event.label === 'scripts/build/finalize-portable-output.cjs'
    )
    const budgetIndex = events.findIndex(
      event => event.name === 'checkArtifactBudgets' && event.label === 'bundle,plugins,portable'
    )

    expect(finalizeIndex).toBeGreaterThanOrEqual(0)
    expect(budgetIndex).toBeGreaterThan(finalizeIndex)
  })

  it('uses the packaging temp directory for fast make', async () => {
    const { events, workflows } = createWorkflowHarness()

    await workflows['make-fast']()

    const makeFastEvent = events.find(
      event => event.name === 'runWithEnvAsync' && event.label.startsWith('LUO_FAST_MAKE=1')
    )
    expect(makeFastEvent?.label).toContain(`TEMP=${electronPackagingTempEnv.TEMP}`)
    expect(makeFastEvent?.label).toContain(`TMP=${electronPackagingTempEnv.TMP}`)
    expect(makeFastEvent?.label).toContain(`TMPDIR=${electronPackagingTempEnv.TMPDIR}`)
  })

  it('logs and rethrows failures from timed serial steps', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await expect(
        runStep('failing-step', () => {
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')
      expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain(
        '[run-target] failing-step: failed after'
      )
    } finally {
      consoleLogSpy.mockRestore()
    }
  })
})
