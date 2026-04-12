# 构建与发布

本文档描述 LUO Music 当前的 Web、Electron、服务端和文档站构建链路。

## 构建矩阵

| 目标              | 命令                                               | 主要输出                                      |
| ----------------- | -------------------------------------------------- | --------------------------------------------- |
| Web               | `npm run build:web`                                | `build/`                                      |
| Electron bundle   | `npm run build` 或 `npm run build:electron:bundle` | `build/`、`build/electron/`、`build/service/` |
| Electron 安装包   | `npm run build:electron`                           | `out/make/`                                   |
| Electron portable | `npm run build:electron:portable`                  | `out/portable/`                               |
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
3. 构建服务端
4. 以 Web 模式构建 Vite 渲染端

### Electron

```bash
npm run build:electron
```

流程：

1. 清理 `build/` 与 `out/`
2. 构建 QQ runtime
3. 并行构建 server 与 electron-vite bundle
4. 使用 Electron Forge 产出安装包

### Portable

```bash
npm run build:electron:portable
```

在 Electron bundle 基础上，调用 `electron-builder.portable.json` 生成单文件便携版。

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
```

## 提交前建议

### 常规代码改动

```bash
npm run test:run
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

- `electron.vite.config.ts`
- `forge.config.ts`
- `electron/utils/paths.ts`
- `scripts/build/`

### Electron 打包阶段报路径错误

优先检查 preload、main、service 产物名是否与当前配置一致，不要硬编码历史名称。

### 安装依赖后 postinstall 报错

先确认 Node / npm 版本，再重新执行：

```bash
npm install
```

项目会在 `postinstall` 中自动修补部分 Windows 打包链路兼容性问题。
