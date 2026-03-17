# 构建产物管理

**最后更新**: 2026-03-15

## 📁 统一输出目录

所有生产环境的构建产物都输出到 `build/` 目录。

```
build/
├── index.html              # Web 入口
├── assets/                 # 静态资源
│   ├── css/                # 样式文件
│   ├── js/                 # JavaScript 文件
│   ├── fonts/              # 字体文件
│   └── img/                # 图片文件
├── electron/               # Electron 主进程和 Preload 脚本
│   ├── main.cjs            # Electron 主进程
│   └── preload.cjs         # Preload 脚本
└── server/                 # API 服务端
    └── server.cjs          # 编译后的服务端代码
```

Electron Forge 打包输出目录：

```
out/
├── make/                   # 安装包（.exe, .zip）
└── LUO Music-win32-x64/    # 便携版（未打包）
    ├── resources/
    │   ├── app.asar/      # Electron 应用代码
    │   └── server/        # API 服务端（extraResource）
    │       └── server.cjs
    └── ...
```

**已废弃的目录：**

- ❌ `dist/` - 已迁移至 `build/`
- ❌ `dist-electron/` - 已迁移至 `build/electron/`
- ❌ `dist-server/` - 已迁移至 `build/server/`
- ❌ `release_v2/` - 已迁移至 `out/` (Electron Forge)

## 🚀 构建命令

### 依赖安装

```bash
# 安装所有依赖（包含 devDependencies）
npm install

# 仅安装生产依赖（Vercel 部署）
npm install --production
```

### Web 构建

```bash
# 构建 Web 版本（生产环境）
npm run build:web

# 构建 Web 版本（包含 API 服务器）
npm run build:server && npm run build:web
```

### Electron 构建

```bash
# 开发模式（热重载）
npm run dev:electron

# 构建 Electron 应用（仅构建，不打包）
npm run build

# 构建并打包 Electron 应用（生成安装包）
npm run build:electron

# 仅打包（使用已构建的文件）
npm run make
```

### 服务端构建

```bash
# 仅构建服务端（用于 Web 版本或独立运行）
npm run build:server

# 运行服务端（开发模式）
npm run server

# 或
npm run dev:server
```

### 代码质量

```bash
# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# Prettier 格式化
npm run format

# TypeScript 类型检查
npm run typecheck
```

### 测试

```bash
# 运行所有测试
npm run test:run

# 交互式测试 UI
npm run test:ui

# 生成覆盖率报告
npm run test:coverage
```

## 📦 API 服务端 (Server) 说明

### 运行方式

应用使用 **子进程模式** 运行 API 服务：

- 网易云音乐 API: 通过 `scripts/dev/netease-api-server.cjs` 子进程启动
- QQ 音乐 API: 通过 `scripts/dev/qq-api-server.cjs` 子进程启动

**优点**：
- API 崩溃不影响主进程
- 可以独立重启 API 服务
- 资源隔离更好

**架构**：
- `ServiceManager` 统一管理所有 API 子进程
- 支持健康检查和自动重启
- 通过 HTTP 进行进程间通信

### ServiceManager 使用

```typescript
import { serviceManager } from './ServiceManager'

// 初始化并启动服务
await serviceManager.initialize({
  services: {
    netease: { enabled: true, port: 14532 },
    qq: { enabled: true, port: 3200 }
  }
})

// 停止单个服务
await serviceManager.stopService('netease')

// 启动单个服务
await serviceManager.startService('netease')

// 重启服务
await serviceManager.restartService('netease')

// 获取服务状态
const status = serviceManager.getServiceStatus('netease')

// 获取所有可用服务
const services = serviceManager.getAvailableServices()

// 停止所有服务
await serviceManager.stopAll()
```

### Server 构建

```bash
# 构建 server.ts 到 build/server/server.cjs
pnpm build:server
```

### Server 打包

`forge.config.ts` 配置：
```typescript
packagerConfig: {
  extraResource: [
    'build/server'  // 打包到 resources/server/
  ]
}
```

打包后的路径：
- 开发环境: `build/server/server.cjs`
- 生产环境: `resources/server/server.cjs`

## 🧹 清理构建产物

```bash
# 清理构建产物
pnpm clean

# 清理所有（包括 node_modules）
pnpm clean:all
```

## 📊 构建模式说明

### 开发模式

- 输出目录：`dist/`
- 包含 Source Map
- 不压缩代码
- 支持热重载

### 生产模式

- 输出目录：`build/`
- 移除 Source Map
- 压缩代码
- 优化打包体积
- 代码分割优化

## 🔧 配置说明

### electron-vite 配置 (`electron.vite.config.ts`)

```typescript
// Electron 主进程输出目录
outDir: 'build/electron'

// Preload 脚本输出目录  
outDir: 'build/electron'

// 渲染进程输出目录
outDir: 'build'
```

### Forge 配置 (`forge.config.ts`)

- **打包配置**: `packagerConfig` 定义了应用打包选项
- **安装包制作**: `makers` 包含 `MakerSquirrel` (Windows 安装程序) 和 `MakerZIP`
- **插件**: `AutoUnpackNativesPlugin` 自动解包原生模块
- **额外资源**: `extraResource` 包含 API 服务端代码

### Package.json 脚本

- `build`: 使用 electron-vite 构建
- `build:server`: 构建 API 服务端
- `build:electron`: 完整构建并打包
- `dev:electron`: 开发模式（热重载）
- `server`: 运行 API 服务端（tsx）

## 📦 部署建议

### Web 部署

1. 运行 `pnpm build:web`
2. 部署 `build/` 目录到静态服务器
3. 同时部署并运行 API 服务端：
   ```bash
   node build/server/server.cjs
   ```
4. 配置服务器支持 SPA 路由

### Electron 部署

1. 运行 `pnpm build:electron`
2. 产物在 `out/make/` 目录
   - `LUO Music-1.0.0 Setup.exe` - Windows 安装程序
   - `LUO Music-1.0.0.zip` - 便携版压缩包
3. 分发安装包或便携版

### 独立 Server 部署

如果只需要 API 服务端：

```bash
# 构建
pnpm build:server

# 运行
node build/server/server.cjs
```

环境变量：
- `NCM_PORT`: 网易云 API 端口（默认 14532）
- `PORT`: Koa 服务端口（如有）

## ⚠️ 注意事项

1. **electron-vite**: 使用 `electron-vite` 构建 Electron 主进程、preload 和渲染进程
2. **编码统一**：项目文本文件统一使用 UTF-8（无 BOM），避免编码不一致导致的乱码与构建异常
2. **Electron Forge**: 使用 `@electron-forge` 进行应用打包和分发
3. **输出目录**: Forge 默认输出到 `out/` 目录（可在 `forge.config.ts` 中修改）
4. **API 服务端**:
   - API 服务通过子进程启动（QQ 音乐和网易云）
   - 使用 `ServiceManager` 管理服务子进程
   - 打包时通过 `extraResource` 包含 server 代码

## 🎯 构建优化

- **代码分割**: 按功能和库分割代码块
- **资源优化**: 字体、图片单独打包
- **Tree Shaking**: 移除未使用代码
- **压缩**: CSS 和 JS 压缩
- **缓存优化**: 使用内容哈希

## 🔨 故障排除

### 打包失败

```bash
# 清理并重试
pnpm clean
pnpm build:electron
```

### 端口占用

```bash
# 查找并结束占用 14532 或 3200 端口的进程
netstat -ano | findstr :14532
taskkill /F /PID <PID>
```

### Server 构建失败

```bash
# 重新构建 server
pnpm build:server

# 检查输出
ls build/server/
```

### 依赖问题

```bash
# 重新安装依赖
pnpm install
```
