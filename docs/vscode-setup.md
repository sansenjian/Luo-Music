# 项目框架优化报告

本文档总结了为 LUO Music 项目添加的 VSCode 最佳实践配置和项目框架优化。

## 📦 已添加的配置

### 1. VSCode 调试配置 (`.vscode/launch.json`)

添加了完整的调试配置，支持：

- **Debug Main Process**: 调试 Electron 主进程（Node.js）
- **Debug Renderer (Chrome)**: 调试渲染进程（Vue 组件）
- **Attach to Renderer**: 附加到已运行的渲染进程
- **Debug Full Electron**: 同时调试主进程和渲染进程

**使用方法**：

1. 按 `F5` 或选择调试配置
2. 设置断点
3. 开始调试

### 2. VSCode 扩展推荐 (`.vscode/extensions.json`)

推荐安装以下扩展：

| 扩展                           | 用途                      |
| ------------------------------ | ------------------------- |
| Vue.volar                      | Vue 3 语言支持            |
| vscode-typescript-vue-plugin   | Vue 中的 TypeScript 支持  |
| vs code-eslint                 | ESLint 集成               |
| prettier-vscode                | Prettier 格式化           |
| vscode-tailwindcss             | Tailwind CSS 支持         |
| markdown-preview-github-styles | GitHub 风格 Markdown 预览 |
| vscode-typescript-next         | 最新版 TypeScript 支持    |
| es6-string-html                | ES6 字符串 HTML 高亮      |

### 3. VSCode 任务配置 (`.vscode/tasks.json`)

添加了常用任务：

- `npm: dev` - 启动开发服务器
- `npm: dev:electron` - 启动 Electron 开发模式
- `build:electron` - 构建 Electron
- `build:web` - 构建 Web
- `npm: test:run` - 运行测试
- `npm: typecheck` - TypeScript 类型检查
- `npm: lint:fix` - 自动修复 lint 问题

### 4. VSCode 设置优化 (`.vscode/settings.json`)

新增设置包括：

**文件管理**：

- 排除构建产物和缓存目录
- 配置文件编码为 UTF-8
- 统一行尾为 LF

**编辑器设置**：

- 保存时自动格式化
- 100 字符标尺
- 括号对高亮
- 移除行尾空白

**TypeScript/Vue 设置**：

- 使用工作区 TypeScript
- 相对路径导入
- 单引号偏好
- Vue 组件命名规范

**ESLint/Prettier**：

- 保存时运行 ESLint
- 启用缓存
- 针对每种文件类型的格式化器

**Git 设置**：

- 自动 fetch
- 智能提交

### 5. Git 提交模板 (`.gitmessage`)

定义了提交规范模板：

```
# Types:
# feat:     新功能
# fix:      修复 bug
# docs:     文档变更
# style:    代码格式
# refactor: 重构
# perf:     性能优化
# test:     测试
# chore:    构建/工具
# ci:       CI 配置
# build:    构建系统
# revert:   回滚
```

### 6. Husky 预提交钩子 (`.husky/pre-commit`)

配置了预提交钩子：

```bash
npm run lint:staged
```

在提交前自动运行 lint-staged，检查提交的文件。

### 7. Lint-staged 配置 (`.lintstagedrc.json`)

定义了预提交检查规则：

```json
{
  "*.{ts,vue,js}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
}
```

### 8. EditorConfig (`.editorconfig`)

统一不同编辑器的代码风格：

- UTF-8 编码
- LF 行尾
- 2 空格缩进
- 移除行尾空白
- 添加文件末尾换行

### 9. GitHub 模板

**PULL_REQUEST_TEMPLATE.md**：

- 变更说明
- 问题关联
- 检查清单
- 测试步骤

**ISSUE_TEMPLATE/bug_report.md**：

- 问题描述
- 复现步骤
- 环境信息

**ISSUE_TEMPLATE/feature_request.md**：

- 需求描述
- 期望解决方案
- 使用场景

### 10. 贡献指南 (CONTRIBUTING.md)

完整的贡献指南包括：

- 快速开始
- 开发流程
- 代码规范
- 测试指南
- 提交规范

## 📋 使用指南

### 首次设置

```bash
# 安装依赖
npm install
```

`npm install` 会通过 `prepare` 脚本自动安装 Husky，无需再额外执行安装命令。

### 调试配置

1. **调试 Electron 主进程**：
   - 选择 "Debug Main Process" 配置
   - 按 F5 启动
   - 在 `electron/` 目录下的代码中设置断点

2. **调试渲染进程**：
   - 先运行 `npm run dev`
   - 选择 "Debug Renderer (Chrome)" 配置
   - 按 F5 启动调试

3. **同时调试主进程和渲染进程**：
   - 选择 "Debug Full Electron" 配置
   - 按 F5 启动

### 提交代码

```bash
# 暂存文件
git add .

# 提交（会自动运行 lint-staged）
git commit -m "feat: 添加新功能"

# 如果忘记使用模板
git commit
# 编辑器会显示 .gitmessage 模板
```

## 🔍 项目结构优化建议

### 当前状态

项目已经具有良好的架构：

- ✅ 平台抽象层（Web/Electron）
- ✅ 音乐平台适配器（网易云/QQ 音乐）
- ✅ 服务注册表模式
- ✅ 统一错误处理
- ✅ Sentry 集成
- ✅ 完整的测试体系

### 建议优化（长期）

1. **功能模块化**：考虑按功能领域组织代码

   ```
   src/features/
   ├── player/
   ├── search/
   ├── playlist/
   └── user/
   ```

2. **依赖注入**：引入自动依赖注入工具

3. **API 类型安全**：使用 Zod 或类似工具进行 API 响应验证

4. **性能监控**：添加更详细的性能指标收集

## 📊 配置对比

| 配置项     | 优化前 | 优化后         |
| ---------- | ------ | -------------- |
| 调试支持   | ❌     | ✅ 完整        |
| 扩展推荐   | ❌     | ✅ 8 个        |
| 任务配置   | ❌     | ✅ 8 个        |
| 预提交钩子 | ❌     | ✅ Husky       |
| 提交模板   | ❌     | ✅ .gitmessage |
| PR 模板    | ❌     | ✅             |
| Issue 模板 | ❌     | ✅ 2 个        |
| 贡献指南   | ❌     | ✅             |

## 🎯 下一步

1. 安装推荐的 VSCode 扩展
2. 熟悉调试配置
3. 使用预提交钩子保证代码质量
4. 遵循提交规范

## 📚 参考链接

- [VSCode 调试文档](https://code.visualstudio.com/docs/editor/debugging)
- [Husky 文档](https://typicode.github.io/husky/)
- [Lint-staged 文档](https://github.com/okonet/lint-staged)
- [约定式提交](https://www.conventionalcommits.org/)
- [EditorConfig](https://editorconfig.org/)
