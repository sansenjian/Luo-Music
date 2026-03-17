# 🚀 快速参考卡片

## 常用命令

```bash
# 开发
npm run dev              # 完整开发模式
npm run dev:web          # Web 模式
npm run dev:electron     # Electron 开发模式

# 构建
npm run build:web        # 构建 Web
npm run build:electron   # 构建 Electron

# 测试
npm run test:run         # 运行测试
npm run test:ui          # 测试 UI
npm run test:coverage    # 覆盖率报告

# 代码质量
npm run lint             # ESLint 检查
npm run lint:fix         # 自动修复
npm run typecheck        # TypeScript 检查
npm run format           # Prettier 格式化
```

## 调试配置

| 配置名称 | 用途 | 快捷键 |
|----------|------|--------|
| Debug Main Process | 调试 Electron 主进程 | F5 |
| Debug Renderer (Chrome) | 调试渲染进程 | F5 |
| Debug Full Electron | 同时调试 | F5 |

## Git 提交规范

```bash
# 格式：<type>: <subject>

# 示例
git commit -m "feat: 添加播放器歌词同步功能"
git commit -m "fix: 修复播放列表无法刷新的问题"
git commit -m "refactor: 重构用户中心组件"
```

### 提交类型

| 类型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `style` | 代码格式 |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `chore` | 构建/工具 |
| `ci` | CI 配置 |
| `build` | 构建系统 |
| `revert` | 回滚 |

## VSCode 扩展推荐

必装扩展：
- Vue.volar
- vscode-eslint
- prettier-vscode

推荐扩展：
- vscode-tailwindcss
- markdown-preview-github-styles
- es6-string-html

## 目录结构

```
luo-music/
├── .vscode/                 # VSCode 配置
│   ├── launch.json         # 调试配置
│   ├── tasks.json          # 任务配置
│   ├── settings.json       # 编辑器设置
│   └── extensions.json     # 扩展推荐
├── .husky/                  # Git 钩子
│   └── pre-commit          # 预提交钩子
├── .github/                 # GitHub 配置
│   ├── ISSUE_TEMPLATE/     # Issue 模板
│   └── PULL_REQUEST_TEMPLATE.md
├── src/                     # 源代码
│   ├── api/                # API 层
│   ├── components/         # 组件
│   ├── composables/        # 组合式函数
│   ├── platform/           # 平台抽象
│   ├── router/             # 路由
│   ├── services/           # 服务层
│   ├── store/              # 状态管理
│   └── utils/              # 工具
├── electron/                # Electron 主进程
├── server/                  # API 服务端
├── tests/                   # 测试
└── docs/                    # 文档
```

## 文件命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `LyricDisplay.vue` |
| 组合式函数 | camelCase | `usePlayer.ts` |
| 工具函数 | camelCase | `formatTime.ts` |
| 常量 | kebab-case | `player-config.const.ts` |
| 类型 | 驼峰 + `.types.ts` | `api.types.ts` |
| 测试 | `.test.ts` | `playerStore.test.ts` |

## 环境要求

- Node.js >= 24.x
- npm >= 10.x

## 遇到问题？

1. 清理缓存：`npm run clean`
2. 重新安装：`rm -rf node_modules && npm install`
3. 类型检查：`npm run typecheck`
4. 代码检查：`npm run lint:fix`

## 相关文档

- [VSCode 配置文档](./vscode-setup.md)
- [优化总结](./optimization-summary.md)
- [贡献指南](../CONTRIBUTING.md)
