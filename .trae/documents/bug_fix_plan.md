# luo_music Bug 修复与优化计划

本计划旨在修复 `luo_music` 项目中已识别的 Electron 配置问题、歌词同步逻辑缺陷以及时间解析脆弱性问题，以提高应用的稳定性和可维护性。

## 1. Electron 路径配置修复 (高优先级)

**问题描述**: `package.json` 中的入口文件路径与 `electron/main.js` 中的资源加载路径可能存在不一致，导致打包后应用白屏（找不到 `index.html`）。

**执行步骤**:
- [ ] **检查 `package.json`**: 确认 `main` 字段指向正确的构建输出文件（通常是 `dist-electron/main.js` 或 `dist/electron/main.js`）。
- [ ] **修正 `electron/main.js`**: 
    - 优化 `DIST` 和 `VITE_PUBLIC` 环境变量的路径解析逻辑。
    - 确保 `win.loadFile` 在生产环境中能正确找到 `index.html`。
    - 统一开发环境 (`VITE_DEV_SERVER_URL`) 和生产环境的加载逻辑。

## 2. 歌词同步逻辑重构 (中优先级)

**问题描述**: 当前歌词索引更新依赖于 UI 组件 (`Lyric.vue`) 内部的定时器。如果组件未挂载（如页面切换），歌词进度无法更新，且逻辑分散，违背单一数据源原则。

**执行步骤**:
- [ ] **修改 `src/utils/audioManager.js`**: 
    - 在 `timeupdate` 事件回调中，除了更新播放进度，还应触发歌词索引的计算（或通知 Store）。
- [ ] **更新 `src/store/playerStore.js`**:
    - 添加 `updateLyricIndex` action（或集成到 `setSeek` / `updateProgress` 中）。
    - 实现基于当前时间和歌词数组计算 `currentLyricIndex` 的逻辑。
- [ ] **清理 `src/components/Lyric.vue`**:
    - 移除 `onMounted` 中的 `setInterval`。
    - 直接使用 `playerStore.currentLyricIndex` 作为响应式数据源。

## 3. 时间解析逻辑增强 (低优先级)

**问题描述**: `src/utils/lyric.js` 中的 `formatLyricTime` 使用硬编码截取字符串，无法处理超过 100 分钟的音频或非标准格式的时间戳。

**执行步骤**:
- [ ] **重构 `formatLyricTime`**:
    - 使用正则表达式 (e.g., `/\[(\d+):(\d+\.?\d*)\]/`) 提取分钟和秒数。
    - 确保解析逻辑能处理不同位数的分钟数和不同精度的秒数。

## 4. 验证与测试

**验证步骤**:
- [ ] **启动开发服务器**: 确保应用正常运行，无报错。
- [ ] **测试歌词同步**: 播放歌曲，观察歌词是否随进度滚动，且在切换页面后切回依然同步。
- [ ] **测试打包 (可选)**: 尝试运行 `npm run build` 检查构建产物结构是否符合预期。
