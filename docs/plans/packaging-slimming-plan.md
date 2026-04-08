# 打包瘦身计划

## 背景

当前 Electron 打包流程已经可以稳定产出安装包，但实际发行产物中仍包含一批不必要的内容。

对 [`out/LUO Music-win32-x64/resources/app.asar`](./../../out/LUO%20Music-win32-x64/resources/app.asar) 的检查结果表明：

- 没有误把顶层 `src/`、`tests/`、`docs/`、`electron/`、`api/` 整体打进包里
- 但仍然打进了大量运行时不需要的脚本、sourcemap 和依赖文档/元数据

这类内容不会直接导致运行失败，但会增大发行包体积、增加更新成本，也会让包内容变得不够可控。

## 已确认的问题

### 1. `scripts/` 被打进了 `app.asar`

当前在 `app.asar` 中可见的脚本包括：

- `scripts/build-qq-runtime.cjs`
- `scripts/clean-force.js`
- `scripts/ensure-no-shadow-configs.cjs`
- `scripts/patch-cross-zip.cjs`
- `scripts/run-with-env.cjs`
- `scripts/README.md`
- `scripts/dev/*`
- `scripts/runtime/*`

其中只有极少数运行时脚本可能有保留价值，大多数都属于构建期或开发期文件。

### 2. `app.asar` 中包含大量 sourcemap

统计结果：

- `app.asar` 内有约 `4736` 个 `.map` 文件

这些文件对于开发排障有价值，但默认不应直接进入最终发行包。

### 3. `node_modules` 里有大量 README / 元数据 / 杂项文件

基于 `README.md`、`.github`、`.vscode`、`coverage`、`@playwright`、`@vitest` 等模式扫描，命中约 `617` 条。

这说明当前生产包还带入了明显多余的依赖附带文件。

## 初步根因

### Forge ignore 规则不够严格

当前 [`forge.config.ts`](./../../forge.config.ts) 里只排除了：

- `scripts/dev/dev-electron-launcher.cjs`
- `scripts/utils/**`

这不足以阻止其他 `scripts/*` 文件进入 `app.asar`。

### Electron 构建默认保留 sourcemap

当前 [`electron.vite.config.ts`](./../../electron.vite.config.ts) 中：

- `main.build.sourcemap = true`
- `preload.build.sourcemap = true`
- `renderer.build.sourcemap = true`

这会让构建产物天然携带 `.map` 文件，随后被打进发行包。

### 依赖文件裁剪没有额外控制

现在主要依赖 Forge / packager 默认行为，没有进一步裁剪：

- 依赖包中的 `README.md`
- `.github/`
- `.vscode/`
- `coverage/`
- 其他包附带文档和开发元信息

## 目标

本轮打包瘦身的目标不是“极限减包”，而是先做风险最低、收益最高的三件事：

1. 不让明显的构建/开发脚本继续进入 `app.asar`
2. 默认不把 sourcemap 带进发行包
3. 尽量减少依赖包里的 README / 元数据类文件进入发行包

## 范围

优先处理：

- [`forge.config.ts`](./../../forge.config.ts)
- [`electron.vite.config.ts`](./../../electron.vite.config.ts)
- 与运行时脚本路径有关的主进程代码

暂不处理：

- 依赖升级导致的体积变化
- Electron / Chromium 自带二进制资源
- 语言包（locales）精简

## 建议步骤

### Phase 1：清理 `scripts/` 误打包

目标：

- 只保留运行时真正需要的脚本到 `extraResource`
- 从 `app.asar` 中去掉构建和开发辅助脚本

建议动作：

1. 收紧 [`forge.config.ts`](./../../forge.config.ts) 的 `ignore`
2. 明确哪些脚本必须通过 `extraResource` 进入发行包
3. 验证 `ServiceManager`、QQ runtime、Netease runtime 的实际路径不受影响

验收标准：

- `app.asar` 中不再包含无关 `scripts/*`
- `resources/` 下保留运行时确实需要的脚本

### Phase 2：关闭发行包 sourcemap

目标：

- 发行构建默认不携带 `.map`

建议动作：

1. 调整 [`electron.vite.config.ts`](./../../electron.vite.config.ts)
2. 根据需要保留单独调试包或 CI 构建产物中的 sourcemap，而不是塞进发行包

验收标准：

- `app.asar` 中 `.map` 文件显著下降，理想情况为 `0`

### Phase 3：裁剪依赖元数据

目标：

- 减少依赖包中的 README / `.github` / coverage / `.vscode` 一类文件

建议动作：

1. 评估是否可通过更严格的打包过滤规则裁剪依赖附带文件
2. 先做“白名单保留运行时资源”的方向，避免过度黑名单维护

验收标准：

- `app.asar` 中 README / metadata 类文件明显减少

## 风险

### 风险 1：误删运行时脚本

最主要风险是：

- QQ / Netease 服务脚本实际依赖 `scripts/dev/*` 或 `scripts/runtime/*` 的某些文件

应对：

- 先查路径依赖，再收紧 `ignore`
- 每轮改完后都重新跑 `npm run make`

### 风险 2：关闭 sourcemap 影响线上排障

应对：

- 区分“发行包”和“调试构建”
- 如有需要，把 sourcemap 保留在单独构建产物或上传到错误监控系统，而不是打进 `app.asar`

### 风险 3：依赖裁剪过度导致运行失败

应对：

- 依赖文件裁剪放到最后做
- 先完成脚本与 sourcemap 两项低风险优化

## 验收方式

每轮优化后都重新检查：

1. `npm run make`
2. Windows 示例：`npx asar list out\\LUO Music-win32-x64\\resources\\app.asar`
3. 跨平台占位示例：`npx asar list out/<app>-<platform>-<arch>/resources/app.asar`
4. 对以下模式重新计数：
   - `scripts/`
   - `*.map`
   - `README.md`
   - `.github`
   - `.vscode`
   - `coverage`

## 当前结论

当前打包**没有误把整个业务源码目录打进去**，但**确实还带了较多无用内容**。

因此这不是“打包失控”，而是一个典型的“产物可运行，但还不够瘦”的问题。

下一步最值得做的是：

1. 先清理 `scripts/`
2. 再处理 sourcemap
3. 最后再评估依赖元数据裁剪
