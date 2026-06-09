export type ElectronStoreInstanceLike = {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export type ElectronStoreConstructorLike<T extends ElectronStoreInstanceLike> = new (options?: {
  projectName: string
}) => T

type ElectronStoreModuleLike<T extends ElectronStoreInstanceLike> =
  | ElectronStoreConstructorLike<T>
  | {
      default?: ElectronStoreConstructorLike<T>
    }

type ElectronStoreTestGlobal<T extends ElectronStoreInstanceLike> = typeof globalThis & {
  __LUO_ELECTRON_STORE_TEST_MOCK__?: ElectronStoreModuleLike<T>
}

export function getElectronStoreConstructor<
  T extends ElectronStoreInstanceLike
>(): ElectronStoreConstructorLike<T> {
  const storeModule =
    (globalThis as ElectronStoreTestGlobal<T>).__LUO_ELECTRON_STORE_TEST_MOCK__ ??
    (require('electron-store') as ElectronStoreModuleLike<T>)

  if (typeof storeModule === 'function') {
    return storeModule
  }

  return storeModule.default ?? (storeModule as unknown as ElectronStoreConstructorLike<T>)
}
