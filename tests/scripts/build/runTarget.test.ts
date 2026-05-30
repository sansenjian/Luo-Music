import { createRequire } from 'node:module'

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

function createWorkflowHarness() {
  const events: BuildEvent[] = []
  const record = (name: string, label: string, detail?: unknown) => {
    events.push({ detail, label, name })
  }
  const workflows = createWorkflows({
    clean: (targets: string[], options?: Record<string, unknown>) =>
      record('clean', targets.join(','), options),
    getNpmCommandParts: () => ['npm'],
    npmRun: (scriptName: string, args: string[] = []) => record('npmRun', scriptName, args),
    npmRunAsync: async (scriptName: string, args: string[] = []) =>
      record('npmRunAsync', scriptName, args),
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
    expect(getElectronBundleCleanTargets()).toEqual(
      expect.arrayContaining(['build/assets', 'build/electron'])
    )
    expect(getElectronBundleCleanTargets()).toEqual(
      expect.arrayContaining(['build/index.html', 'build/favicon.svg', 'build/tray.ico'])
    )
    expect(getElectronBundleCleanTargets()).not.toEqual(
      expect.arrayContaining(['build', 'build/service', 'build/runtime'])
    )
  })

  it.each(['electron', 'package', 'electron-portable', 'make-fast'])(
    'prepares %s by packaging third-party plugins in parallel with the Electron bundle',
    async target => {
      const { events, workflows } = createWorkflowHarness()

      await workflows[target]()

      const prepareEvent = events.find(
        event => event.name === 'parallel' && event.label === `${target}:prepare`
      )
      expect(prepareEvent?.tasks).toEqual(['electron-bundle', 'package-third-party-plugins'])

      const bundleParallelIndex = events.findIndex(
        event => event.name === 'parallel' && event.label === 'electron-bundle'
      )
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

    const packageEvent = events.find(
      event => event.name === 'parallel' && event.label === 'electron-all:package'
    )
    expect(packageEvent?.tasks).toEqual(['electron-forge:make', 'electron-builder:portable'])
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
