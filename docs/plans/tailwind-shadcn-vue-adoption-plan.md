# Tailwind CSS 与 Shadcn Vue 渐进引入计划

更新时间：2026-06-23

这份计划用于把 LUO Music 的前端样式开发从“大量手写 scoped style + 分散 class”逐步收口到“项目设计 token + Tailwind CSS + Shadcn Vue 基础组件”的模式。目标不是重写整个播放器界面，而是先建立稳定的 UI 基础设施，让后续设置页、弹窗、表单、列表操作和移动端适配更容易维护。

## 结论

建议引入 Tailwind CSS 和 Shadcn Vue，但采用渐进式路线：

- Tailwind CSS 作为新样式底座，优先承接布局、间距、字号、状态色和响应式规则。
- Shadcn Vue 作为基础控件来源，优先覆盖按钮、输入框、弹窗、菜单、Tabs、Switch、Slider、Tooltip 等通用交互。
- 现有 `src/assets/main.css` 的 `--ui-*`、`classic`、`brand` 主题变量继续保留，先映射到 Shadcn/Tailwind token，再迁移页面。
- 播放器主体、歌词、封面动效、Electron 窗口控制、本地音乐扫描等强业务 UI 暂不重写，只在后续功能迭代中局部替换。

## 当前问题

项目现在已经有清晰的 Web/Electron、services、platform、store、features 边界，但 UI 样式层还比较分散：

- `src` 下有大量 `.vue` 文件，许多组件内部包含较长的 `scoped style`。
- 全局样式主要集中在 `src/assets/main.css`，里面已经形成项目自己的主题 token。
- 通用控件缺少统一实现，同类按钮、面板、弹窗、列表项、输入框容易重复写。
- 后续如果继续扩展设置页、插件 UI、用户中心、本地音乐和移动端界面，纯手写 CSS 的维护成本会继续上升。

因此，真正要解决的问题不是“换一套外观”，而是建立可复用、可演进、可测试的 UI 开发方式。

## 不做什么

第一阶段明确不做这些事：

- 不全量重写 `Home.vue`、`UserCenter.vue`、`Player.vue`、歌词和媒体详情区域。
- 不删除现有 `--ui-*` 主题变量。
- 不把 Electron/preload/IPC 逻辑引入 Shadcn 组件。
- 不把所有 scoped style 一次性改成 Tailwind class。
- 不为了 Shadcn Vue 改动现有服务层、播放器状态或平台适配边界。

## 技术选择

### Tailwind CSS

采用 Tailwind CSS v4 路线，原因：

- Shadcn Vue 当前组件体系以 Tailwind CSS v4、TypeScript 和 Reka UI primitives 为主要底座。
- Tailwind v4 支持 CSS-first 配置，可以用 `@theme` 和 CSS 变量承接项目现有 token。
- 项目已有 Vite/Vue 构建链路，Tailwind 的 Vite 插件可以作为 renderer 构建插件接入。

### Shadcn Vue

Shadcn Vue 不作为传统黑盒 UI 库使用，而作为“组件源码模板库”使用：

- 组件生成到 `src/components/ui/`。
- 项目可以直接修改生成组件以适配 LUO Music 的主题、尺寸和交互。
- 复杂业务组件继续留在 `src/features/` 或现有业务组件目录中。
- 后续如有必要，再在 Shadcn 组件外包一层项目语义组件，例如 `LuoButton`、`LuoDialog`、`LuoTabs`。

## 目录规划

建议使用下面的最小目录结构：

```text
src/
├── assets/
│   ├── main.css
│   └── tailwind.css
├── components/
│   └── ui/
│       ├── button/
│       ├── dialog/
│       ├── input/
│       ├── tabs/
│       ├── dropdown-menu/
│       ├── switch/
│       ├── slider/
│       └── tooltip/
├── lib/
│   └── utils.ts
└── features/
    └── ...
```

说明：

- `src/components/ui/` 放 Shadcn Vue 生成组件。
- `src/lib/utils.ts` 放 `cn()` 等 class 合并工具。
- `src/assets/tailwind.css` 放 Tailwind import、theme token 映射和 Shadcn base layer。
- 现有 `src/assets/main.css` 继续作为项目主题变量和全局基础样式入口；是否拆分在 Tailwind 接入稳定后再决定。

## Token 映射策略

现有主题变量是项目资产，不能绕开。第一阶段要让 Shadcn token 指向现有变量：

```css
@import 'tailwindcss';

@theme {
  --color-background: var(--ui-app-bg);
  --color-foreground: var(--black);
  --color-card: var(--ui-surface);
  --color-card-foreground: var(--black);
  --color-primary: var(--ui-primary-bg);
  --color-primary-foreground: var(--ui-primary-text);
  --color-border: var(--ui-border-color);
  --color-muted: var(--ui-surface-muted);
  --radius-sm: var(--ui-radius-sm);
  --radius-md: var(--ui-radius-md);
  --radius-lg: var(--ui-radius-lg);
}
```

注意事项：

- `--ui-primary-bg` 当前在 `brand` 风格中是渐变，不能直接当作所有 Tailwind `color-*` 使用。需要为颜色和背景分别建立 token，例如 `--ui-primary-color` 与 `--ui-primary-bg`。
- `classic` 风格里大量 radius 为 `0px`，Shadcn 默认圆角需要被项目 token 覆盖。
- 先保证 `classic` 和 `brand` 两套风格都能显示，再考虑新增主题包。

## 分阶段路线

### P0：基础设施接入

目标：让 Tailwind CSS 和 Shadcn Vue 能在项目里稳定工作，但不迁移业务页面。

动作：

- 安装 Tailwind CSS、`@tailwindcss/vite`、Shadcn Vue 运行依赖。
- 在 `.config/vite.config.ts` 的 renderer 插件链路中接入 Tailwind Vite 插件。
- 创建 `components.json`，使用项目 alias：
  - `components`: `@/components`
  - `ui`: `@/components/ui`
  - `utils`: `@/lib/utils`
  - `lib`: `@/lib`
- 新增 `src/lib/utils.ts`，提供 `cn()`。
- 新增 `src/assets/tailwind.css`，先完成 Tailwind import 和 token 映射。
- 在应用入口加载 Tailwind CSS，确认不会破坏现有 `main.css`。

验收：

- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build:web` 通过。
- Web 运行时首页、播放器、用户中心和登录入口视觉没有明显回归。

### P1：基础控件试点

目标：证明 Shadcn Vue 可以融入现有主题系统，并减少重复控件实现。

优先生成组件：

- `button`
- `input`
- `dialog`
- `tabs`
- `dropdown-menu`
- `switch`
- `slider`
- `tooltip`

优先迁移区域：

- `CacheManager.vue`
- 登录相关弹窗中的按钮、关闭按钮和状态提示区域
- `HomeSearchBar.vue` 的输入框和操作按钮
- `HomeServerSelect.vue` 的选择交互
- 设置页中独立的 switch、slider、button

暂不迁移：

- 播放器主控件
- 歌词滚动和虚拟列表
- 本地音乐歌曲列表的大规模行渲染
- Electron 窗口控制按钮

验收：

- 迁移区域在 `classic` 和 `brand` 两种 render style 下视觉一致。
- 键盘焦点、hover、disabled、loading 状态完整。
- 弹窗类组件使用可访问的 focus trap 和 Escape 关闭行为。
- 不新增渲染进程直接访问 Node/Electron 的代码。

### P2：项目 UI 约定固化

目标：让新代码默认使用统一 UI 写法。

动作：

- 在 `docs/agent/architecture.md` 或新增 UI 规范文档中补充样式规则。
- 明确新组件优先使用：
  - Shadcn Vue 基础组件
  - Tailwind utility class
  - 项目 CSS token
- 规定何时允许继续写 scoped style：
  - 播放器、歌词、动画、复杂媒体布局
  - 需要深度覆盖第三方或原生控件时
  - Tailwind class 会显著降低可读性时
- 建立 UI 组件使用清单，避免重复造按钮、弹窗、输入框。

验收：

- 新增 UI 开发有明确入口。
- 常用控件不再散落重复实现。
- 代码 review 可以用同一套规则判断样式写法是否合理。

### P3：中风险页面渐进迁移

目标：把控件密集但业务边界清楚的页面逐步迁到新体系。

候选区域：

- 用户中心 toolbar、tab、筛选、空状态
- 插件设置表单
- 本地音乐导入和扫描状态
- 错误提示、toast、confirm dialog
- 搜索结果页中的操作按钮和分页/状态区域

验收：

- 每次迁移只覆盖一个明确区域。
- 每次迁移都能独立通过 typecheck、lint、build。
- 如果迁移后样式复杂度没有下降，停止扩大范围并复盘。

### P4：播放器专项评估

播放器相关 UI 最后再评估，不能因为引入 Shadcn 就强行重写。

评估对象：

- `Player.vue`
- 歌词显示
- 播放进度和音量 slider
- 封面动效
- 桌面歌词入口
- 播放队列和媒体详情

只有在满足以下条件后才考虑迁移：

- Shadcn/Tailwind 已在多个低风险区域稳定使用。
- 主题 token 已稳定。
- 播放器视觉回归测试或手动检查清单明确。
- 迁移能明显降低维护成本，而不是只改变写法。

## 风险与处理

| 风险                                   | 影响                           | 处理方式                                             |
| -------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Tailwind base 样式影响现有布局         | 首页、播放器、滚动容器可能变形 | 先在试点分支接入，逐页截图检查；必要时限制 base 影响 |
| Shadcn token 与现有 `--ui-*` 不匹配    | 新旧组件视觉割裂               | 先做 token 映射，不急着迁移页面                      |
| 渐变 token 不能直接作为 Tailwind color | primary、track、brand 样式异常 | 拆分纯色 token 和背景 token                          |
| class 过长降低可读性                   | Vue template 难维护            | 抽成局部 computed class 或组件 variant               |
| Reka UI 弹窗/菜单行为与现有逻辑冲突    | 登录、菜单、焦点行为异常       | 弹窗类组件优先单独试点，保留回滚点                   |
| Electron 窗口控制误迁移                | 拖拽、关闭、最小化行为异常     | 窗口控制区域暂不迁移                                 |

## 开发规则

- 新增 UI 控件优先从 `src/components/ui/` 选择。
- 新增页面样式优先使用 Tailwind class 和项目 token。
- 复杂状态 class 不用字符串拼接，优先使用 `cn()` 或 computed。
- 动态 Tailwind class 不拼接不可静态分析的片段，例如避免 `bg-${color}`。
- 大列表和高频渲染区域避免过度组件抽象。
- 业务组件继续通过 Props / Emits 通信，不为了 UI 迁移引入全局状态。
- 任何 Shadcn 组件改造都要保持 TypeScript 类型明确，不扩散 `any`。

## 推荐执行顺序

1. 创建 `sansenjian/ui-framework-adoption` 分支。
2. 完成 P0 基础设施接入。
3. 只生成 P1 需要的 Shadcn 组件，不一次性安装全量组件。
4. 迁移 `CacheManager.vue` 或一个设置页片段作为第一个试点。
5. 跑 `npm run typecheck`、`npm run lint`、`npm run build:web`。
6. 手动检查 Web 首页、用户中心、登录弹窗、播放器底栏。
7. 确认无明显回归后，再迁移第二个控件密集区域。

## 完成标准

这条路线完成时，应达到以下状态：

- 项目可以稳定使用 Tailwind CSS 和 Shadcn Vue。
- `classic` 和 `brand` 两种 render style 都能驱动新 UI 组件。
- 常用按钮、输入框、弹窗、菜单、Tabs、Switch、Slider 不再重复手写。
- 新功能有明确 UI 开发路径。
- 旧页面不需要一次性重写，但后续迭代可以自然迁移。

## 后续文档同步

P0 和 P1 落地后，需要同步更新：

- `docs/plans/index.md`：把本计划加入当前主线或后续优化。
- `docs/agent/architecture.md`：补充 UI 样式和组件边界规则。
- `docs/components-documentation.md`：记录项目基础 UI 组件清单。
- `docs/testing.md`：补充 UI 迁移后的手动检查面。
