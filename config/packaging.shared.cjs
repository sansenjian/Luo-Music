const appId = "com.sansenjian.luo-music";
const productName = "LUO Music";
const asarUnpackPattern =
  "**/node_modules/{conf,ajv,json-schema-traverse,atomically,dot-prop,uint8array-extras,type-fest}/**";

const runtimeExtraResources = {
  service: "build/service",
  qqRuntime: "build/runtime/qq-api-server.cjs",
  qqSearchFallback: "scripts/runtime/qq-search-fallback.cjs",
  neteaseApiServer: "scripts/runtime/netease-api-server.cjs",
};

const packagingExtraResources = [
  runtimeExtraResources.service,
  runtimeExtraResources.qqRuntime,
  runtimeExtraResources.qqSearchFallback,
  runtimeExtraResources.neteaseApiServer,
];

const packagingWorkspaceArtifactsToRemove = [
  ".ai",
  ".claude",
  ".codex",
  ".github",
  ".husky",
  ".idea",
  ".kilocode",
  ".playwright-mcp",
  ".trae",
  ".userData",
  ".vite_cache",
  ".vscode",
];

const packagingNodeModulesToRemoveAfterPrune = [
  "node_modules/.vite-temp",
  "node_modules/@electron-forge",
  "node_modules/@playwright",
  "node_modules/@sentry/bundler-plugin-core",
  "node_modules/@sentry/rollup-plugin",
  "node_modules/@sentry/vite-plugin",
  "node_modules/@types",
  "node_modules/@vitejs",
  "node_modules/electron",
  "node_modules/electron-nightly",
  "node_modules/playwright",
  "node_modules/playwright-core",
  "node_modules/typescript",
  "node_modules/vite",
  "node_modules/vitest",
];

const packagingIgnoredNodeModulePaths = [
  "node_modules/@fontsource",
  "node_modules/date-fns",
  ...packagingNodeModulesToRemoveAfterPrune,
];

const electronBuilderExtraResources = [
  {
    from: runtimeExtraResources.service,
    to: "service",
    filter: ["**/*"],
  },
  {
    from: runtimeExtraResources.qqRuntime,
    to: ".",
    filter: ["qq-api-server.cjs"],
  },
  {
    from: runtimeExtraResources.qqSearchFallback,
    to: ".",
    filter: ["qq-search-fallback.cjs"],
  },
  {
    from: runtimeExtraResources.neteaseApiServer,
    to: ".",
    filter: ["netease-api-server.cjs"],
  },
];

module.exports = {
  appId,
  asarUnpackPattern,
  electronBuilderExtraResources,
  packagingExtraResources,
  packagingIgnoredNodeModulePaths,
  packagingNodeModulesToRemoveAfterPrune,
  packagingWorkspaceArtifactsToRemove,
  productName,
  runtimeExtraResources,
};
