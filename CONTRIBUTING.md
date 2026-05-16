# 贡献指南

以下是参与项目开发的基本流程。

## 快速开始

### 环境要求

- Node.js >= 24.x
- npm >= 10.x
- Git

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
# 完整开发模式（API 服务 + Vite）
npm run dev

# Web 模式（不需要 API 服务）
npm run dev:web

# Electron 开发模式
npm run dev:electron
```

## 分支策略

- `master` 是稳定主分支，只接受 Pull Request 更新。
- `dev` 是默认开发集成分支，日常开发从 `dev` 拉分支。
- `dev` 也优先通过 Pull Request 更新，避免未验证变更直接进入集成分支。
- 紧急修复如需从 `master` 拉 hotfix 分支，应在合并后同步回 `dev`。

详细规则见 [开发分支流程](./docs/development-workflow.md)。

## 开发流程

### 1. Fork 项目

点击右上角的 Fork 按钮创建你的项目副本。

### 2. 克隆仓库

```bash
git clone https://github.com/<your-username>/luo-music.git
cd luo-music
git fetch origin
git switch dev
git pull --ff-only
```

### 3. 创建分支

```bash
git switch -c feature/your-feature-name
# 或
git switch -c fix/your-bug-fix
```

### 4. 开发和测试

在提交代码前，请确保：

- 运行所有测试并通过：`npm run test:run`
- Oxlint 检查通过：`npm run lint`
- TypeScript 类型检查通过：`npm run typecheck`

### 5. 提交代码

我们使用约定式提交规范：

```bash
# 格式：<type>: <subject>
# type 可以是：feat, fix, docs, style, refactor, test, chore, ci, build, revert

git commit -m "feat: 添加新功能"
```

### 6. 推送到你的 Fork

```bash
git push origin feature/your-feature-name
```

### 7. 创建 Pull Request

在 GitHub 上导航到你的 Fork，点击 "Compare & pull request"。普通开发 PR 的目标分支选择 `dev`；需要发布或稳定化时，再从 `dev` 向 `master` 创建 PR。

## 代码规范

### Oxlint + Prettier / Oxfmt

项目默认使用 Oxlint 做快速代码检查，Prettier 作为主格式化器；Oxfmt 已作为可选格式化检查引入，便于逐步对比和迁移：

```bash
# 检查代码
npm run lint
npm run format:check
npm run format:oxfmt:check

# 自动修复
npm run lint:fix
npm run format
npm run format:oxfmt
```

### TypeScript

所有新代码必须使用 TypeScript 编写，并确保类型定义完整。

### Vue 组件规范

- 使用 Composition API 和 `<script setup>` 语法
- 组件名使用 PascalCase
- Props 使用 camelCase 定义，模板中使用 kebab-case

## 测试

```bash
# 运行所有测试
npm run test

# 运行测试（不监听）
npm run test:run

# 生成覆盖率报告
npm run test:coverage
```

涉及 `better-sqlite3` 的 native 测试使用：

```bash
npm run test:native
```

## 项目结构

```
luo-music/
├── src/                    # 源代码
│   ├── api/               # API 层
│   ├── components/        # Vue 组件
│   ├── composables/       # 组合式函数
│   ├── platform/          # 平台抽象层
│   ├── router/            # 路由配置
│   ├── services/          # 服务层
│   ├── store/             # Pinia 状态管理
│   ├── utils/             # 工具函数
│   └── views/             # 页面视图
├── electron/              # Electron 主进程
├── server/                # API 服务端
├── tests/                 # 测试文件
└── docs/                  # 文档
```

## 提交规范

我们遵循约定式提交规范：

| 类型       | 描述                       |
| ---------- | -------------------------- |
| `feat`     | 新功能                     |
| `fix`      | 修复 bug                   |
| `docs`     | 文档变更                   |
| `style`    | 代码格式（不影响代码运行） |
| `refactor` | 重构                       |
| `perf`     | 性能优化                   |
| `test`     | 测试相关                   |
| `chore`    | 构建/工具/配置变更         |
| `ci`       | CI 配置变更                |
| `build`    | 构建系统变更               |
| `revert`   | 回滚提交                   |

## 报告问题

请在 [Issues](https://github.com/sansenjian/Luo-Music/issues) 中报告问题，并提供：

- 清晰的标题
- 复现步骤
- 预期行为和实际行为
- 环境信息（OS、Node.js 版本等）
- 截图（如适用）

## 功能建议

欢迎在 Issues 中提出功能建议，请描述：

- 需求场景
- 期望的解决方案
- 使用场景

## 许可证

本项目采用 PolyForm-Noncommercial-1.0.0 许可证。
