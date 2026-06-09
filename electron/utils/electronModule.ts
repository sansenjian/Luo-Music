type ElectronModule = typeof import('electron')

type ElectronTestGlobal = typeof globalThis & {
  __LUO_ELECTRON_TEST_MOCK__?: Partial<ElectronModule>
}

export function getElectronModule(): ElectronModule {
  const testMock = (globalThis as ElectronTestGlobal).__LUO_ELECTRON_TEST_MOCK__

  if (testMock) {
    return testMock as ElectronModule
  }

  return require('electron') as ElectronModule
}
