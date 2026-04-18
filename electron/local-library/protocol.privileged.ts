export const LOCAL_MEDIA_SCHEME = 'luo-media'

let privilegedSchemeRegistered = false

export type ElectronPrivilegedProtocolModule = {
  protocol?: {
    registerSchemesAsPrivileged?: (
      customSchemes: Array<{
        scheme: string
        privileges: {
          standard?: boolean
          secure?: boolean
          supportFetchAPI?: boolean
          stream?: boolean
          corsEnabled?: boolean
        }
      }>
    ) => void
  }
}

function getElectronProtocolModule(): ElectronPrivilegedProtocolModule {
  const electronModule = require('electron') as ElectronPrivilegedProtocolModule | string
  if (typeof electronModule !== 'object' || electronModule === null) {
    return {}
  }

  return electronModule
}

export function registerPrivilegedLocalMediaScheme(
  electronModule: ElectronPrivilegedProtocolModule = getElectronProtocolModule()
): void {
  if (privilegedSchemeRegistered) {
    return
  }

  const { protocol } = electronModule
  protocol?.registerSchemesAsPrivileged?.([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])

  privilegedSchemeRegistered = true
}
