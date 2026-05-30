# Scripts 目录结构

本目录包含项目的所有构建、开发和工具脚本。

## 📁 目录结构

```
scripts/
├── README.md           # 本说明文件
├── build/              # 构建相关脚本
│   ├── clean.cjs       # 统一清理入口
│   ├── clean-targets.cjs # 定向清理构建产物（Windows 优化）
│   ├── run-target.cjs  # build / make / package 调度入口
│   ├── package-third-party-plugins.cjs # 生成第三方插件安装 zip
│   ├── check-artifact-budgets.cjs # 检查打包产物体积预算
│   └── finalize-portable-output.cjs # 收敛单文件便携版输出，只保留 .exe
│
├── dev/                # 开发环境脚本
│   ├── dev-electron-launcher.cjs  # Electron 开发启动器
│   └── qq-api-server.cjs          # QQ 音乐 API 服务（端口 3200）
│
├── runtime/            # 开发与打包共用运行时脚本
│   ├── netease-api-server.cjs     # 网易云 API 服务（端口 14532）
│   ├── qq-api-server.entry.cjs    # QQ 音乐打包入口
│   └── qq-search-fallback.cjs     # QQ 搜索兜底实现
│
└── utils/              # 工具脚本
    ├── analyze-deps.js     # 依赖分析工具
    ├── copy-deps.cjs       # 依赖复制工具
    └── kill-and-clean.js   # 进程清理工具
```

## 🚀 使用方式

### 构建脚本

```bash
# 清理构建产物
npm run clean

# 清理所有（包括 node_modules）
npm run clean:all

# 构建单文件便携版
npm run build:electron:portable
```

### 工具脚本

```bash
# 分析依赖
npm run analyze:deps

# 检查未使用依赖
npm run check:unused
```

### 开发脚本

开发脚本通常通过 npm scripts 自动调用：

```bash
# 启动开发服务器（包含 API 服务）
npm run dev:server

# 启动 Electron 开发环境
npm run dev:electron
```

## 📝 脚本详细说明

### build/

#### clean.cjs

统一清理入口，复用 `clean-targets.cjs` 的 Windows 文件锁定处理能力。

**参数：**

- `--force`: 自动结束占用进程
- `--all`: 删除 node_modules
- 额外路径参数：只清理指定路径

**使用示例：**

```bash
node scripts/build/clean.cjs --force
node scripts/build/clean.cjs --all
node scripts/build/clean.cjs dist build/service
```

**功能：**

1. 强制结束 Electron 相关进程
2. 使用重命名策略绕过文件锁定
3. 清理构建产物目录

#### run-target.cjs

构建调度入口，承载 `package.json` 中较长的 build / make / package 流程。

**常用目标：**

- `build`: Electron bundle 构建
- `web`: Web 构建
- `electron-bundle`: 清理并构建 Electron bundle
- `electron-bundle-no-clean`: 不清理，直接构建 Electron bundle
- `electron`: 生成 Electron 安装包
- `electron-portable`: 生成单文件便携版
- `electron-all`: 准备一次 Electron bundle，并行生成安装包和 portable
- `package`: 生成 Electron package
- `make`: 生成 Electron 安装包
- `make-fast`: 快速 make 模式

`electron`、`electron-portable`、`package` 和 `make-fast` 会在 Electron bundle 准备阶段并行生成 `out/third-party-plugins/*.zip`，插件页可使用这些 zip 重新安装内置平台插件。

`electron-all` 用于完整打包：共享一次 bundle 和插件 zip，然后并行执行 Forge make 与 electron-builder portable，完成后运行产物体积预算检查。

#### check-artifact-budgets.cjs

检查 `build/`、`out/make/`、`out/portable/` 和 `out/third-party-plugins/` 等打包产物的大小。默认只输出 warning；传入 `--strict` 或设置 `LUO_ARTIFACT_BUDGET_STRICT=1` 时，超限或缺失产物会让脚本失败。

#### package-third-party-plugins.cjs

将 `plugins/third-party/` 下的每个插件目录打包为稳定 zip 输出。脚本会校验 manifest、入口文件和输出目录边界，默认只写入 `out/third-party-plugins/`。

#### finalize-portable-output.cjs

单文件便携版打包后处理脚本。

**功能：**

1. 检查 `out/portable/` 中是否恰好生成一个 `.exe`
2. 删除同目录下的其他文件或临时目录
3. 确保最终输出目录只保留单个便携版 `.exe`

### runtime/

#### netease-api-server.cjs

启动网易云音乐 API 服务，开发环境与打包产物共用。

**端口：** 14532（可通过 `PORT` 环境变量修改）

**功能：**

- 启动 NeteaseCloudMusicApi Enhanced
- 健康检查确认服务可用
- 支持进程间通信

#### qq-search-fallback.cjs

QQ 音乐搜索兜底实现，供开发服务和打包后的 QQ runtime 入口复用。

### dev/

#### qq-api-server.cjs

启动 QQ 音乐 API 服务。

**端口：** 3200（可通过 `PORT` 环境变量修改）

**功能：**

- 启动 @sansenjian/qq-music-api
- 使用用户数据目录避免权限问题
- 健康检查和进程通信

#### dev-electron-launcher.cjs

Electron 开发环境启动器。

**功能：**

- 管理 Electron 开发进程
- 热重载支持
- 错误处理和日志记录

### utils/

#### analyze-deps.js

依赖分析工具，生成详细报告。

**分析内容：**

1. 主要依赖版本检查
2. 安全漏洞扫描（npm audit）
3. 过时依赖检测
4. 未使用依赖检查
5. 依赖大小分析
6. 重复依赖检查

**优化建议：**

- 定期运行 `npm audit fix`
- 使用 `npm run update:deps` 更新依赖
- 检查未使用依赖
- 分析打包体积

#### copy-deps.cjs

依赖复制工具（CommonJS 模块）。

#### kill-and-clean.js

进程清理工具。

## 🔧 维护指南

### 新增脚本

1. **分类放置**：
   - 构建相关 → `build/`
   - 开发相关 → `dev/`
   - 工具脚本 → `utils/`

2. **命名规范**：
   - ESM 模块使用 `.js` 扩展名
   - CommonJS 模块使用 `.cjs` 扩展名
   - 使用 kebab-case 命名

3. **路径更新**：
   - 修改脚本位置后，更新 `package.json` 中的 scripts 路径
   - 确保路径计算正确（通常需要 `../../` 回到根目录）

### 路径计算示例

```javascript
// ESM 模块 (.js)
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..') // 回到项目根目录

// CommonJS 模块 (.cjs)
const path = require('path')
const projectRoot = path.resolve(__dirname, '..', '..')
```

## 📊 相关命令

```bash
# 查看依赖分析报告
npm run analyze:deps

# 更新依赖版本
npm run update:deps

# 检查未使用依赖
npm run check:unused

# 清理构建产物
npm run clean

# 完全清理（包括 node_modules）
npm run clean:all
```

## ⚠️ 注意事项

1. **Windows 文件锁定**：使用 `clean.cjs` 的 `--force` 参数可自动结束占用进程
2. **权限问题**：QQ API 服务会自动切换到用户数据目录，避免写入权限问题
3. **路径依赖**：所有脚本都使用相对路径计算，确保从任何位置调用都能正确定位
