export type ElectronModuleLike = Record<string, unknown>

type ElectronTestGlobal = typeof globalThis & {
  __LUO_ELECTRON_TEST_MOCK__?: ElectronModuleLike
}

export function getElectronModule<T extends ElectronModuleLike = ElectronModuleLike>(): T {
  const testMock = (globalThis as ElectronTestGlobal).__LUO_ELECTRON_TEST_MOCK__

  if (testMock) {
    return testMock as T
  }

  return require('electron') as T
}
