# CSS 使用现状与收敛记录（2026-04-08）

## 结论

本轮已完成一轮最小 CSS 收敛，当前项目的样式结构比检查时更清晰：

- 全局主题变量和基础样式已统一收口到 `src/assets/main.css`
- `src/App.vue` 中重复的全局样式已移除
- 公共样式依赖的缺失 token 已在全局层补齐
- 未接入入口的旧组件 CSS 文件已清理
- 单组件使用的共享类已回收到组件内部

当前样式结构已经基本完成收敛：全局层仅负责主题 token 与基础样式，页面和组件默认走局部样式。

## 本轮修改

### 1. 统一全局主题入口

本轮将以下内容统一收口到 `src/assets/main.css`：

- `:root` 主题变量
- `body` 字体与基础排版
- `#app` 根布局
- 全局滚动条样式
- 全局工具类

当前 `src/assets/main.css` 已作为唯一全局主题入口使用。

### 2. 移除 `App.vue` 中重复的全局样式

`src/App.vue` 原先定义了另一套全局样式，并覆盖了主题变量、字体和滚动条样式。该部分已移除。

这样处理后：

- 全局样式来源只剩一个
- 后续调整主题时不再需要同时修改两个文件
- 避免了颜色变量与基础样式“看似都对、实际互相覆盖”的情况

### 3. 补齐公共 token

为保证 `src/assets/components/index.css` 中的共享样式稳定可用，本轮已补齐以下 token：

- `--accent-hover`
- `--accent-light`
- `--gray-lighter`
- `--radius`
- `--shadow`

这些变量现已在 `src/assets/main.css` 中统一定义。

### 4. 明确全局层职责

本轮的职责划分调整为：

- `src/assets/main.css`
  - theme tokens
  - reset / base
- 各页面与组件
  - 默认使用 `<style scoped>`

### 5. 清理未接入的旧 CSS 文件

本轮已删除以下未被入口或组件引用的文件：

- `src/assets/components/player.css`
- `src/assets/components/search.css`
- `src/assets/components/playlist.css`

删除前已确认这些文件在仓库中的唯一引用仅来自本报告文档，不参与当前构建链路。

### 6. 移除失去用途的共享样式入口

继续检查后发现：

- 全局 `.btn` 仅由 `src/components/LyricFloat.vue` 使用，且该组件本身已有局部按钮样式
- 全局 `.loading` 仅由 `src/components/home/HomeSearchBar.vue` 使用
- `src/assets/components/index.css` 中其余 `.input`、`.card`、`.btn-primary`、`.empty-*` 类未发现实际依赖

因此本轮进一步处理了：

- 将 `LyricFloat.vue` 的按钮样式完全本地化
- 将 `HomeSearchBar.vue` 的 loading 样式完全本地化
- 删除 `src/assets/components/index.css`
- 删除 `src/main.ts` 中对该文件的入口引用
- 删除 `src/assets/main.css` 中未使用的工具类

## 当前结构

### 活跃样式层级

- 全局主题与基础样式：`src/assets/main.css`
- 全局共享组件样式：`src/assets/components/index.css`
- 页面/组件局部样式：
  - `src/views/Home.vue`
  - `src/views/UserCenter.vue`
  - `src/components/SearchInput.vue`
  - `src/components/LyricFloat.vue`
  - `src/components/Player.css`

### 当前主要样式模式

- Vue SFC 内联 `<style scoped>`
- 少量外置组件样式文件通过 scoped 引入

代码库中共发现 28 个 Vue 样式块，其中 27 个为 `<style scoped>`。这说明项目当前仍然是“局部样式优先”的结构。

## 已解决的问题

### 已解决 1：全局样式定义重复

检查阶段发现 `src/assets/main.css` 与 `src/App.vue` 同时定义了全局主题变量、字体和滚动条样式。

本轮已处理完成：

- 全局主题统一到 `src/assets/main.css`
- `src/App.vue` 不再承载全局 CSS

### 已解决 2：公共样式令牌未闭环

检查阶段发现 `src/assets/components/index.css` 使用了多个未定义变量。

本轮已处理完成：

- 缺失变量已补齐
- 公共样式不再依赖隐式覆盖关系

### 已解决 3：疑似遗留 CSS 文件

检查阶段发现以下文件未被实际引用：

- `src/assets/components/player.css`
- `src/assets/components/search.css`
- `src/assets/components/playlist.css`

本轮已处理完成：

- 删除未接入入口的旧 CSS 文件
- 保留当前仍在使用的样式入口

### 已解决 4：共享组件样式入口失去用途

继续收敛后确认：

- `src/assets/components/index.css` 不再承担有效职责
- 原本依赖它的少量类已经局部化

本轮已处理完成：

- 删除 `src/assets/components/index.css`
- 让共享样式层退出构建入口
- 将全局样式边界收敛为 `theme tokens + base`

## 仍待处理的问题

### 1. 主题层仍可继续拆分

当前 `src/assets/main.css` 已经比较聚焦，但如果后续还要继续强化设计系统，仍可以把 token 单独拆到独立文件。

## 后续建议

### 优先级 P1

- 继续坚持 `scoped + CSS variables` 作为默认方案
- 只有在出现明确、多处复用的样式模式时，才重新引入共享组件层

### 优先级 P2

- 如需进一步增强设计系统，可将 token 抽到 `src/assets/tokens.css`
- 由 `main.css` 继续作为基础层聚合入口

### 优先级 P3

- 在视觉统一任务中再决定是否需要重建真正的共享样式层
- 避免为了“看起来规范”过早恢复大而泛的全局类库

## 建议落地规则

- 页面和组件样式默认放在各自 `.vue` 文件中，使用 `<style scoped>`
- 全局文件只保留：
  - theme tokens
  - reset / base
- 不再新增未接入入口的独立 CSS 文件
- 不再默认新增全局共享类，除非已确认有稳定复用需求
- 新增 token 前先定义，再引用
