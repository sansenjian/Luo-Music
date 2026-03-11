# 构建产物管理

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

### Web 构建

```bash
# 构建 Web 版本（生产环境）
pnpm build

# 构建 Web 版本（包含 API 服务器）
pnpm build:web
```

### Electron 构建

```bash
# 开发模式（热重载）
pnpm dev:electron

# 构建 Electron 应用（仅构建，不打包）
pnpm build

# 构建并打包 Electron 应用（生成安装包）
pnpm build:electron

# 仅打包（使用已构建的文件）
pnpm electron-forge make
```

### 服务端构建

```bash
# 仅构建服务端（用于 Web 版本或独立运行）
pnpm build:server

# 运行服务端（开发模式）
pnpm server

# 或
pnpm dev:server
```

## 📦 API 服务端 (Server) 说明

### 运行方式

#### 方式一：集成在 Electron 主进程中（默认）

Electron 主进程直接加载 API 模块：
- 网易云 API: `serveNcmApi()` 在主进程中直接调用
- QQ 音乐 API: `require('@sansenjian/qq-music-api')` 在主进程中加载

**优点**：
- 启动速度快
- 无需进程间通信
- 代码简单，易于调试

**缺点**：
- API 崩溃可能影响主进程稳定性
- 无法独立重启 API 服务

#### 方式二：独立子进程（可选）

使用 `ServerManager` 以子进程方式运行 API：

```typescript
import { serverManager } from './ServerManager'

// 启动服务
await serverManager.start()

// 停止服务
await serverManager.stop()

// 重启服务
await serverManager.restart()

// 获取状态
const isRunning = serverManager.getStatus()
```

**优点**：
- API 崩溃不影响主进程
- 可以独立重启 API 服务
- 资源隔离更好

**缺点**：
- 需要进程间通信
- 启动稍慢

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
2. **Electron Forge**: 使用 `@electron-forge` 进行应用打包和分发
3. **输出目录**: Forge 默认输出到 `out/` 目录（可在 `forge.config.ts` 中修改）
4. **API 服务端**: 
   - Electron 版本中 API 默认集成在主进程中
   - 如需独立进程，可使用 `ServerManager`
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
