# 构建与发布

本文档描述 LUO Music 当前的 Web、Electron、服务端和文档站构建链路。

## 构建矩阵

| 目标              | 命令                                               | 主要输出                                      |
| ----------------- | -------------------------------------------------- | --------------------------------------------- |
| Web               | `npm run build:web`                                | `dist/`                                       |
| Electron bundle   | `npm run build` 或 `npm run build:electron:bundle` | `build/`、`build/electron/`、`build/service/` |
| Electron 安装包   | `npm run build:electron`                           | `out/make/`、`out/third-party-plugins/`       |
| Electron portable | `npm run build:electron:portable`                  | `out/portable/`、`out/third-party-plugins/`   |
| Electron 完整打包 | `npm run build:electron:all`                       | `out/make/`、`out/portable/`、插件 zip        |
| Server            | `npm run build:server`                             | `build/service/index.cjs`                     |
| Docs              | `npm run docs:build`                               | `docs/.vitepress/dist/`                       |

## 关键脚本

### Web

```bash
npm run build:web
```

流程：

1. 清理 `dist` 与 `build/service`
2. 执行配置守卫
3. 通过本地 `tsdown` CLI 构建服务端
4. 通过本地 VP CLI 以 Web 模式构建 Vite+ 渲染端

### Server

```bash
npm run build:server
```

服务端入口 `server/index.ts` 通过本地 `tsdown` CLI 打包到 `build/service/index.cjs`。该构建使用 Rolldown，显式读取 `tsconfig.node.json`，并通过 `--no-config` 避免被未来其他 tsdown 配置影响。当前服务端依赖仍保持外置运行时加载，和迁移前产物行为一致。

### Electron

```bash
npm run build:electron
```

流程：

1. 清理安装包输出目录
2. 通过 `build:electron:bundle` 清理并重建 Electron renderer / main / preload 相关产物
3. 构建 QQ runtime
4. 构建 server 与本地 `electron-vite:build`
5. 将 `plugins/third-party/` 下的插件逐个打成 zip 到 `out/third-party-plugins/`
6. 使用 Electron Forge 产出安装包

Electron bundle 暂不切换到 `vp build`：主进程、preload、Forge 和 native rebuild 仍依赖 Electron 专属构建链路。项目通过 `npm run electron-vite:build` 调用本地 `electron-vite` CLI，避免依赖全局 PATH。

Electron 打包职责保持拆分：

- Electron Forge 是主安装包打包器，负责 `npm run build:electron`、`npm run make` 和 Squirrel / zip 输出。
- electron-builder 只服务 portable 单文件构建，由 `npm run build:electron:portable` 调用 `electron/builder.portable.cjs`。
- 两条链路共享 `config/packaging.shared.cjs`，但不要在 Forge 和 electron-builder 之间复制专属配置。

生产包瘦身规则也集中在 `config/packaging.shared.cjs`：打包时会排除工作区缓存、检查结果、dev-only 工具链，以及仅构建期使用的根层 Sentry browser/replay 相关包；Electron 主进程仍通过 `@sentry/electron` 在有 DSN 时动态初始化。

### Portable

```bash
npm run build:electron:portable
```

在 Electron bundle 基础上，调用 `electron/builder.portable.cjs` 生成单文件便携版。

第三方插件不会打进应用包内。`package`、`make`、`build:electron` 和 `build:electron:portable` 会额外生成 `out/third-party-plugins/*.zip`，播放器插件页可通过这些 zip 包重新安装对应插件。

### 完整打包

```bash
npm run build:electron:all
```

完整打包目标会只准备一次 Electron bundle 和第三方插件 zip，然后并行执行 Electron Forge 安装包与 electron-builder portable 产物。适合发布前一次性生成全部桌面端产物，避免分别运行 `build:electron` 和 `build:electron:portable` 时重复构建 renderer/main/preload/server/runtime。

打包完成后会执行产物体积预算检查。默认模式只输出 warning；发布流水线可设置 `LUO_ARTIFACT_BUDGET_STRICT=1` 或直接调用 `node scripts/build/check-artifact-budgets.cjs --strict ...` 将超限或缺失产物升级为失败。

### 文档站

```bash
npm run docs:dev
npm run docs:build
```

`docs/.vitepress/dist` 属于生成产物，不应作为源码提交。

## 输出目录

```text
build/
  index.html
  assets/
  electron/
    main.cjs
    preload.cjs
  service/
    index.cjs

out/
  make/
  portable/
  third-party-plugins/
    <platform-id>-<version>.zip
```

## 提交前建议

### 常规代码改动

```bash
npm run test:run
npm run quality
npm run vp:check
npm run vp:lint
npm run vp:fmt:check
```

### 涉及构建 / Electron / 路径

```bash
npm run test:run
npm run build:web
npm run build:electron
```

### 涉及文档站

```bash
npm run docs:build
```

## 常见问题

### 构建失败但开发能跑

优先检查：

- `electron/vite.config.ts`
- `electron/forge.config.ts`
- `electron/utils/paths.ts`
- `scripts/build/`

### Electron 打包阶段报路径错误

优先检查 preload、main、service 产物名是否与当前配置一致，不要硬编码历史名称。

### 安装依赖后 postinstall 报错

先确认 Node / npm 版本，再重新执行：

```bash
npm install --prefer-online
```

项目 `.npmrc` 默认使用官方 npm registry，并启用 `prefer-online` 避免旧缓存或镜像旧元数据影响依赖解析。CI 安装优先使用 `npm ci --prefer-online`。项目会在 `postinstall` 中自动修补部分 Windows 打包链路兼容性问题。
