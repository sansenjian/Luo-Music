# 前端结构收口计划

更新时间：2026-05-23

这份计划基于 2026-05-23 的项目结构分析，承接已有的 [项目结构优化规划](./project-structure-optimization-plan.md) 和 [归属审计](./project-structure-ownership-audit.md)，聚焦前端层面的边界收口和分层清理。

## 当前状态

前几天优化规划中的 P0-A（归属审计）已完成，P0-B（shared 迁移 + alias + 边界脚本）已落地。但结构分析暴露出几个新老问题：

- `composables/` 33 个文件平铺，按技术类型分层已不足以表达功能归属
- `components/` 中包含页面级组件（Playlist、CacheManager、SettingsPanel 等），模糊了页面与组件的边界
- `features/` 只有 `home/` 和 `user-center/` 两个领域，归属审计已标记迁移目标但实际迁移未执行
- `core/` 与 `utils/` 的职责边界缺少明确标准
- `UserAvatar.vue` 当前分支收口后仍约 500 行，登录路由、下拉定位、session 导入等职责还可继续拆

## 建议执行顺序

先做收益大、风险小的结构调整，再处理需要改动业务逻辑的拆分。

---

## P1：composables 分桶

### 目标

把 33 个扁平文件按领域归入子目录，让开发者按功能找 hook 而不是在一层平铺中搜索。

### 分桶方案

```
src/composables/
├── player/
│   ├── usePlayerViewModel.ts
│   ├── useActiveLyricState.ts
│   ├── useIpcActiveLyricState.ts
│   ├── useCoverSwipe.ts
│   └── useMediaSession.ts
├── lyric/
│   ├── useLyricAutoScroll.ts
│   ├── useLyricVirtualScroll.ts
│   ├── useDesktopLyricSettings.ts
│   └── useDockedPlayerBarLayout.ts
├── user/
│   ├── useUserData.ts
│   ├── useUserDataQuery.ts
│   ├── useUserPlaylists.ts
│   ├── useUserEvents.ts
│   ├── useLikedSongs.ts
│   ├── useFavoriteAlbums.ts
│   └── useNeteaseLoginProfile.ts
├── library/
│   ├── useLocalLibrary.ts
│   └── local-library/*
├── ui/
│   ├── useAnimations.ts
│   ├── useRenderStyle.ts
│   ├── useSlider.ts
│   ├── useThrottledStyleUpdate.ts
│   ├── useWindowChromeState.ts
│   └── useWindowResizeFrame.ts
├── plugins/
│   └── usePluginManager.ts
├── search/
│   └── useSearch.ts
├── app/
│   ├── useAppSettings.ts
│   ├── useCommandContext.ts
│   ├── useDeferredMount.ts
│   ├── useExperimentalFeatures.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useProjectUi.ts
│   └── useThemeResourcePacks.ts
```

### 注意事项

- `unplugin-vue-components` 和 `unplugin-auto-import` 的扫描路径需要同步扩展到子目录
- 跨领域引用的 hook（如 `useUserData` 被 player 模块引用）保持在子目录内，不做反向迁移
- 每个子目录导出 `index.ts` barrel，渐进式更新引用方
- 不改动业务逻辑，只做 `import` 路径更新

### 完成标准

- 所有 composable 文件按领域归入子目录
- `auto-imports.d.ts` 和 `components.d.ts` 生成正常
- 全部测试通过
- CI lint + typecheck 通过

---

## P2：梳理 components / views / features 边界

### 问题

当前 `components/` 中实际存在三类文件：

| 类别         | 示例                                                         | 应该在                  |
| ------------ | ------------------------------------------------------------ | ----------------------- |
| 通用 UI 组件 | `Toast.vue`、`SearchInput.vue`、`ErrorToast.vue`             | `components/` ✅        |
| 页面级组件   | `Playlist.vue`、`CacheManager.vue`、`SettingsPanel.vue`      | `views/` 或 `features/` |
| 功能模块组件 | `LoginModal.vue`、`QQLoginModal.vue`、`PluginLoginModal.vue` | 待定                    |

而 `views/` 只有 `Home.vue` 和 `UserCenter.vue`，`features/` 只有 `home/` 和 `user-center/`。

### 动作

**P2-A：明确归属标准**

| 层级                 | 判定规则                                              |
| -------------------- | ----------------------------------------------------- |
| `components/`        | 被 3 个以上 views/features 复用，无路由/数据获取依赖  |
| `features/<domain>/` | 属于特定功能领域，含该领域专属组件、composable、utils |
| `views/`             | 对应路由的一级页面入口，薄入口 + 委派到 features      |

**P2-B：迁移页面级组件**

把以下组件迁入对应 feature 或 views：

| 当前位置                       | 目标                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `components/Playlist.vue`      | `features/user-center/` 或拆为 feature + 通用列表组件 |
| `components/CacheManager.vue`  | `features/settings/`                                  |
| `components/SettingsPanel.vue` | `features/settings/`                                  |

**P2-C：继续执行归属审计中的未完成迁移**

归属审计已标记大量 composables 和 utils 的目标归属，但实际文件移动未执行。P1 的 composables 分桶完成后，在 P2-C 中执行归属审计标记的文件迁移。

### 完成标准

- 规则文档落地，新增文件有明确归属指引
- 页面级组件从 `components/` 迁出
- 归属审计中标记的未完成迁移项全部执行或明确放弃

---

## P3：拆分 UserAvatar.vue 剩余职责

### 背景

当前分支已从 `UserAvatar.vue` 中移走 `createLegacyImportedSession` 和 `checkQQMusicLoginStatus`，组件从约 780 行降到约 500 行。但仍有以下职责混在一起：

### 剩余职责拆分

| 职责                                                                                | 行数（估） | 拆分方向                                           |
| ----------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| 下拉菜单定位（`updateDropdownPlacement`）                                           | ~50        | `src/composables/ui/useDropdownPlacement.ts`       |
| 登录路由分发（`openLegacyLoginBridge`/`openPluginLogin`/`openPlatformLogin`）       | ~50        | `src/composables/user/useLoginRouting.ts`          |
| 平台登录状态引导（`refreshLoginPlatformAuthStates`/`bootstrapLoginPlatformStates`） | ~80        | `src/composables/user/usePlatformAuthBootstrap.ts` |
| Legacy session 导入（`importLegacyPlatformSession`）                                | ~40        | `src/composables/user/useLegacySessionImport.ts`   |
| 键盘/外部点击关闭（`handleDocumentKeydown`/`handleDocumentPointerDown`）            | ~25        | `src/composables/ui/useClickOutside.ts`            |

拆分目标：`UserAvatar.vue` 保持在 250 行以内，只负责模板组合和事件委托。

### 完成标准

- `UserAvatar.vue` < 300 行
- 抽出的 composable 有独立单元测试
- 交互行为不变

---

## P4：定义 core/ vs utils/ 边界标准

### 问题

`src/core/` 和 `src/utils/` 都有底层工具，但缺少分界标准。

### 动作

编写简短的边界规则文档，放在 `docs/architecture/` 下：

```
core/   — 框架级基础设施，不依赖 Vue/React，可被 Electron 主进程和 renderer 共同引用
utils/  — 渲染进程专用工具，可以依赖 Vue、Pinia、浏览器 API
```

然后按规则做一轮归属审计，把放错位置的文件迁到正确目录。

### 完成标准

- 规则文档落地
- 归属审计完成，错误归属的文件已迁移或标记忽略原因

---

## P5：补 E2E 测试覆盖

### 背景

`tests/e2e/` 目录存在但内容少，Playwright 配置已在 `.config/playwright.config.ts` 就绪。

### 动作

- 为登录流程（Netease 模态框 → 成功回调 → 状态同步）编写 E2E 用例
- 为 QQ 登录流程（模态框 → 扫码成功 → session 导入）编写 E2E 用例
- 为用户头像下拉菜单（打开/关闭/键盘 Esc/外部点击）编写 E2E 用例

每轮只加 2-3 个用例，不追求一次覆盖全部。

### 完成标准

- 至少 5 个 E2E 用例覆盖核心登录和菜单交互
- 用例在 CI 中可运行（或明确标记为 manual）

---

## 暂不推进

- 大规模重写组件为 Composition API（当前已全部使用 `<script setup>`）
- 引入 Nuxt / Next.js 风格的文件系统路由
- 对 `components.d.ts` / `auto-imports.d.ts` 生成逻辑做自定义改造
- 把所有 `features/` 目录补齐为完整领域（优先迁移已标记的，不新增空壳）

---

## 关联文档

- [项目结构优化详细规划](./project-structure-optimization-plan.md)
- [项目结构归属审计](./project-structure-ownership-audit.md)
- [下一步优化路线图](./next-optimization-roadmap.md)
- [DI 后续路线图](./di-followup-roadmap.md)
