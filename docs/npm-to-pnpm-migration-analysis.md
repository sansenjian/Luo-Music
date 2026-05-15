# npm 到 pnpm 迁移难度分析

更新日期：2026-05-12

## 结论

当前项目从 npm 迁移到 pnpm 的难度评估为：**中等偏上**。

迁移本身可行，收益也明确：pnpm 可以提升安装速度、减少磁盘占用，并通过更严格的依赖解析暴露潜在的隐式依赖问题。真正的复杂度不在 lockfile 转换，而在项目同时包含 Electron、native 模块、Vite+ / VP CLI、CI 缓存、文档命令和大量 npm script 链式调用。

建议采用分阶段迁移：先让脚本和 CI 具备 pnpm 兼容性，再切换 lockfile 和团队文档。

## 当前状态

- 当前包管理器：`npm`
- 当前声明：`packageManager: npm@10.9.8`
- 当前锁文件：`package-lock.json`
- 暂无：`pnpm-lock.yaml`
- 暂无：`pnpm-workspace.yaml`
- Node 约束：`>=22.x`
- 项目形态：Vue 3 + Vite/Vite+ + Electron + 本地服务端
- 已存在潜在 workspace 包：`packages/shared/package.json`

## 难度分布

| 范围                  | 难度 | 说明                                                                               |
| --------------------- | ---- | ---------------------------------------------------------------------------------- |
| 生成 `pnpm-lock.yaml` | 低   | 可通过 `pnpm import` 从 `package-lock.json` 迁移初始锁文件。                       |
| 根脚本迁移            | 中   | `package.json` 中大量脚本硬编码 `npm run`，需要替换或抽象。                        |
| CI 迁移               | 中   | GitHub Actions 需要改为 pnpm setup、pnpm cache、`pnpm install --frozen-lockfile`。 |
| Electron 构建         | 中高 | Electron 安装脚本、Forge、builder、rebuild 流程都要重新验证。                      |
| native 模块           | 高   | `better-sqlite3` 需要验证 Node ABI 与 Electron ABI rebuild/restore 流程。          |
| 依赖解析              | 中高 | pnpm 默认更严格，可能暴露 npm 扁平化 node_modules 下被隐藏的 phantom dependency。  |
| 文档迁移              | 中   | README、AGENTS、docs 中大量 npm 命令需要同步更新。                                 |

## 主要风险点

### 1. npm script 硬编码

根 `package.json` 中存在多处 `npm run`：

- `dev:*`
- `vp:*`
- `quality`
- `lint`
- `format`
- `preview`
- `electron-vite:build`
- `rebuild:native:node`
- `lint:staged`

这些命令在 `pnpm run` 内部继续调用 `npm run` 时虽然不一定立即失败，但会造成包管理器混用，后续排查 lockfile、环境变量和生命周期问题会更困难。

建议迁移时将内部脚本调用统一为包管理器感知 helper，或者直接改为 pnpm 入口。

### 2. native rebuild 流程

项目依赖 `better-sqlite3`，同时存在 Electron 和 Node 测试运行时切换：

- Electron 运行时需要 Electron ABI。
- Vitest / Node 测试运行时需要 Node ABI。
- 当前 `scripts/run-vitest-with-native-restore.cjs` 会在测试前后 rebuild/restore。

迁移 pnpm 后必须重点验证：

- `pnpm rebuild better-sqlite3`
- `pnpm run rebuild:native`
- `pnpm run test:run`
- 测试失败或中断后是否能恢复 Electron native 模块。

### 3. pnpm 10 的 build scripts 审批

pnpm 10 对依赖构建脚本更加谨慎。Electron、`better-sqlite3`、`esbuild` 等依赖可能需要明确允许构建。

建议迁移时在配置中评估并维护允许列表，例如：

```yaml
onlyBuiltDependencies:
  - better-sqlite3
  - electron
  - esbuild
```

实际列表以 `pnpm install` 输出和验证结果为准，不建议盲目扩大。

### 4. pnpm 严格依赖布局

pnpm 不像 npm 一样默认把大量传递依赖平铺到项目根 `node_modules`。如果项目代码、脚本或配置隐式引用了未直接声明的包，迁移后可能报模块找不到。

这类问题一般应通过补充直接依赖解决，而不是通过放宽 `node-linker` 长期绕过。

### 5. CI 与缓存

当前 CI 使用 npm cache 和 `npm ci`。迁移后需要同步改为：

- pnpm setup
- Node setup 的 pnpm cache
- `pnpm install --frozen-lockfile`
- `pnpm run quality`
- `pnpm run build:web`
- `pnpm run test:coverage`

CI 是迁移成败的核心验收点，不能只在本地验证。

## 推荐迁移路线

### 阶段 1：迁移前准备

目标：减少包管理器耦合，不改变 lockfile。

- 梳理并替换 `package.json` 中的内部 `npm run` 调用。
- 将 `scripts/build/run-target.cjs` 中偏 npm 的命名改成 package-manager neutral，例如 `getPackageRunner` / `runScript`。
- 将 `scripts/run-vitest-with-native-restore.cjs` 中的 `getNpmRunner` / `runNpmCommand` 改名并保持对 `npm_execpath` 的兼容。
- 保留 npm 作为当前正式包管理器，先确保所有原命令仍通过。

建议验证：

```bash
npm run test:run
npm run typecheck
npm run lint
npm run build:web
```

### 阶段 2：引入 pnpm workspace 与 lockfile

目标：正式让项目可由 pnpm 安装。

- 新增 `pnpm-workspace.yaml`：

```yaml
packages:
  - '.'
  - 'packages/*'
```

- 执行 `pnpm import` 生成 `pnpm-lock.yaml`。
- 将 `packageManager` 改为团队选定的 pnpm 10.x 版本。
- 检查 `.npmrc` 中 npm 专用配置是否适用于 pnpm。
- 根据安装结果配置 `onlyBuiltDependencies`。

建议验证：

```bash
pnpm install --frozen-lockfile
pnpm run vp:version
pnpm run test:run
pnpm run typecheck
pnpm run lint
pnpm run build:web
```

### 阶段 3：Electron 与 native 全量验证

目标：确认桌面端构建链路不会因为 pnpm 改变 native 模块行为。

重点命令：

```bash
pnpm run rebuild:native
pnpm run rebuild:native:node
pnpm run dev:electron
pnpm run build:electron:bundle
pnpm run build:electron
pnpm run build:electron:portable
```

如果遇到 native 模块 ABI 不匹配，优先检查：

- 是否有 Electron 进程锁定 `.node` 文件。
- 是否通过项目脚本触发 rebuild，而不是直接绕过包装脚本。
- pnpm 是否允许相关依赖运行 install/build script。

### 阶段 4：CI 与文档切换

目标：团队正式切换到 pnpm。

- GitHub Actions 改为 pnpm install 和 pnpm cache。
- README、AGENTS、docs 中的常用命令改为 pnpm。
- 将 `package-lock.json` 移出维护范围，只保留 `pnpm-lock.yaml`。
- 更新问题排查文档，尤其是 Electron 下载、native rebuild、CI frozen lockfile。

建议 CI 验收：

```bash
pnpm install --frozen-lockfile
pnpm run quality
pnpm run test:coverage
pnpm run build:web
pnpm run docs:build
```

## 是否建议立即迁移

建议迁移，但不建议一次性大改。

更稳妥的策略是：

1. 先做脚本 package-manager neutral 化。
2. 再引入 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`。
3. 之后切 CI。
4. 最后统一文档和删除 npm lockfile。

这样即使 native rebuild 或 Electron 打包出现问题，也可以明确定位是在脚本、安装、CI 还是打包阶段，而不是所有变量同时变化。

## 最小验收清单

迁移完成后至少需要通过：

```bash
pnpm install --frozen-lockfile
pnpm run vp:version
pnpm run vp:help
pnpm run test:run
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build:web
pnpm run build:electron:bundle
pnpm run docs:build
```

如果要宣布 Electron 端完全迁移，还应额外通过：

```bash
pnpm run build:electron
pnpm run build:electron:portable
```
