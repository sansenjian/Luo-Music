# Luo Music 项目文档

## 文档目录

### 1. 项目分析
- [项目分析报告](./analysis-report.md) - 完整的项目架构、功能、代码质量和测试分析

### 2. API 文档
- [API 文档](./api-documentation.md) - 所有 API 接口的详细说明和使用示例

### 3. 组件文档
- [组件文档](./components-documentation.md) - Vue 组件的使用说明和最佳实践

## 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 运行测试
```bash
# 单元测试
npm run test:run

# 覆盖率报告
npm run test:coverage

# E2E 测试
npx playwright test
```

### 构建生产版本
```bash
npm run build
```

## 项目结构

```
src/
├── api/              # API 接口层
├── components/       # Vue 组件
├── composables/      # 组合式函数
├── store/            # Pinia Store
├── utils/            # 工具函数
├── views/            # 页面视图
└── main.js           # 入口文件
```

## 技术栈

- **前端框架**: Vue 3.5.13 (Composition API)
- **构建工具**: Vite 7.3.1
- **状态管理**: Pinia 3.0.1
- **UI 框架**: Element Plus 2.9.7
- **动画库**: Anime.js 4.0.2
- **测试框架**: Vitest + Playwright

## 主要功能

- 🎵 音乐播放控制（播放/暂停/进度/音量）
- 📝 歌词显示（原文/翻译/罗马音）
- 🔍 歌曲搜索（多平台支持）
- 📋 播放列表管理
- 🎨 响应式设计

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

[MIT](LICENSE)
