type ElectronModule = typeof import('electron')

type ElectronTestGlobal = typeof globalThis & {
  __LUO_ELECTRON_TEST_MOCK__?: Partial<ElectronModule>
}

export function getElectronModule(): ElectronModule {
  const testMock =
    process.env.VITEST === 'true'
      ? (globalThis as ElectronTestGlobal).__LUO_ELECTRON_TEST_MOCK__
      : undefined

  if (testMock) {
    return testMock as ElectronModule
  }

  return require('electron') as ElectronModule
}
