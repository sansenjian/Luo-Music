# 当前项目规划

更新时间：2026-06-16

这份规划用于把当前仍在推进的本地音乐库、插件平台、Rust 原生音频、文档治理和桌面体验工作排到同一张执行表里。专题文档继续保留实现细节；本页只回答下一阶段先做什么、做到什么程度可以合并、哪些方向暂时不做。

## 当前判断

- 技术主线继续保持 TypeScript + Electron + Rust。当前阶段不引入 Go，也不迁移到 pnpm。
- `dev` 继续作为集成分支。功能分支先收口测试、文档和兼容性，再通过 PR 合入 `dev`。
- 本地音乐库是 Electron 桌面端核心能力，不作为第三方平台插件实现。
- 第三方插件继续走受控 SDK、manifest、capabilities 和 contributions，不开放文件系统、SQLite、native audio 或任意 renderer 代码执行权限。
- Rust helper 是 native audio、SMTC 和后续桌面原生能力的优先路线。新增原生能力先保持 helper 进程隔离，再评估是否抽包。

## P0：收尾当前功能分支

目标是把当前已经落地的 ECHO-inspired 本地库、插件元数据、DSP 协议和文档整理工作稳定合入 `dev`。

交付范围：

| 工作                    | 完成标准                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 本地音乐库去重          | strict / fuzzy 重复索引可重建，分页查询能按 `hideDuplicates`、`showDuplicatesOnly` 和 `duplicateMode` 返回稳定结果 |
| 在线元数据候选          | 在线数据只生成候选和建议，不静默覆盖 embedded 标签；候选评分有测试覆盖                                             |
| 插件 API 版本与能力声明 | `apiVersion`、`capabilitiesV2`、`contributionsV2` 保持向后兼容，旧 manifest 不被破坏                               |
| 音频输出 DSP 设置合同   | bit-perfect 必需路径会强制关闭 DSP；协议 sanitizer 有边界测试                                                      |
| 文档结构                | guide / architecture / reference / plans / reports 分区清晰，旧路径 rewrite 和 sidebar 不断链                      |

验证入口：

```bash
npm run lint
npm run typecheck
npm run test:run
npm run docs:build
```

退出条件：

- 相关单元测试通过，且没有需要手工解释的类型错误或 lint 跳过项。
- 文档站构建通过。
- PR 描述写清本地音乐库、插件 SDK、native audio 协议和文档变更的兼容性影响。

## P1：稳定本地音乐库

目标是让本地曲库成为桌面端可靠的核心入口，而不是只停留在扫描和列表原型。

优先工作：

1. 完成 strict / fuzzy 重复歌曲识别的真实样本验证。
2. 把在线元数据候选接入可人工确认的修复流程。
3. 为大曲库分页、搜索、重复分组和最近添加补性能基线。
4. 保持 renderer 只通过 preload / IPC 访问本地库，不直接读取 SQLite 或文件系统。
5. 继续拆 `electron/local-library/service.ts`，但保持 public IPC 行为稳定。

完成标准：

- 1 万首级别曲库的扫描、分页、搜索和去重有可复现验证流程。
- 重复歌曲隐藏不会误删数据，只改变默认展示结果。
- 元数据修复必须可预览、可回滚，不自动污染用户本地标签。
- `npm run test:native` 覆盖 repository 和 better-sqlite3 相关路径。

## P1：插件平台收口

目标是让内置平台、第一方功能插件和第三方插件走同一套可演进模型。

优先工作：

| 工作                  | 说明                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| extension registry    | 统一汇总 manifest、capabilities、contributions、命令、设置和播放器 hook    |
| 插件标准模型 fixtures | 覆盖歌曲、歌词、歌单、账号资料、喜欢歌曲、用户歌单和歌单歌曲入站转换       |
| legacy 登录收口       | QQ / Netease 专属登录路径继续迁到统一 `PluginLoginModal` 和标准 auth state |
| player hook runner    | 先支持第一方 hook，补生命周期、熔断和清理逻辑                              |
| 边界自动检查          | 防止组件、store、composable 绕过 `services.plugins()` 或插件 facade        |

完成标准：

- 新平台不需要改宿主业务组件才能暴露基础能力。
- 插件禁用、卸载或异常时不会留下监听、定时器或 pending promise。
- 新增业务代码不直接消费平台原始响应字段。

## P1：Rust 原生音频引擎

目标是把 native audio 从“能播放”推进到“可维护、可诊断、可验证”。

优先工作：

1. 继续把 helper 拆成 `native/audio-engine` 多 crate 工作区，避免 `audio-output-helper` 继续膨胀。
2. 把解码、输出、buffer、protocol、diagnostics 边界继续从二进制入口中抽离。
3. 完成输出格式协商、设备切换恢复和状态事件降噪。
4. 将 DSP crate 从占位推进到真实 PCM 链路前，必须先保证 bit-perfect 候选路径仍能被严格识别。
5. 在线歌曲 native 播放继续优先修 Range/growing-cache、URL 过期刷新和进度同步，不急着扩大格式承诺。

完成标准：

- shared、exclusive、Voicemeeter 三种模式切换不会出现双播放或旧 helper 状态残留。
- 真独占失败返回结构化错误，播放器能明确回退或停止，不显示泛化的 `audio error`。
- bit-perfect 文案只在候选条件满足时出现；DSP、音量、重采样或 decoded-f32 路径会明确标为非候选。
- Rust helper build、关键协议测试和 Electron audio output 测试都能通过。

## P2：桌面体验与系统集成

目标是把稳定的桌面能力做成可开关、可诊断、可回退的第一方插件。

候选工作：

| 能力              | 下一步                                                               |
| ----------------- | -------------------------------------------------------------------- |
| Windows 原生 SMTC | 先做 Rust helper PoC，再接入 `builtin.smtc` fallback                 |
| 桌面歌词          | 收敛为单一主数据源，减少 snapshot / fallback 分叉                    |
| 波形可视化        | 作为第一方受信插件验证，不开放第三方任意 UI 执行                     |
| IPC 性能诊断      | 对高频状态事件做节流、白名单和结构化指标，避免播放时触发插件列表刷新 |

完成标准：

- 第一方插件可以在插件管理页启用、停用和诊断。
- 停用后释放资源，不影响核心播放。
- 高频链路有节流或采样策略，不靠关闭日志掩盖根因。

## P2：结构治理和文档治理

目标是让后续功能扩展不再把边界重新打散。

优先工作：

1. 继续执行 `packages/shared`、`src/features`、`src/services`、`electron` 的边界规则。
2. 拆分大型 SFC 和 store 时保持外部 API 稳定，先拆内部职责再移动目录。
3. 为 `src/composables` 和 `src/components` 做归属审计，只把成规模功能迁入 `src/features/*`。
4. 新增或移动文档时同步更新 index、sidebar、rewrite 和关联链接。
5. 让 `docs:build` 成为文档变更的最低验证门槛。

完成标准：

- `npm run lint` 能覆盖核心架构边界检查。
- 新文档可以从首页、分区总览和侧边栏进入。
- 计划文档只保留仍有执行价值的路线，历史结论归档到 reports 或 Git 历史。

## 暂不推进

| 方向                       | 暂缓原因                                                                          | 重启条件                                                         |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 引入 Go helper             | 当前 Rust 已覆盖 native audio / SMTC 的主要维护路线，额外语言会增加构建和分发成本 | 出现 Rust 难以覆盖、且 Go 有明确生态优势的独立子系统             |
| npm 到 pnpm 迁移           | Electron native rebuild、package-lock 和 CI 已围绕 npm 稳定                       | native helper、Electron 打包和 CI 长期稳定后单独评估             |
| 第三方插件任意 renderer UI | 安全边界和资源清理风险高                                                          | 有沙箱、权限、生命周期、性能预算和审核机制后再做                 |
| ASIO / DSD 默认支持        | 授权、硬件验证和用户面窄                                                          | 有真实硬件、授权方案和回归样本后作为 feature flag                |
| 默认 FFmpeg helper         | 包体、外部依赖和 Windows DLL 分发成本高                                           | Symphonia fallback 明确不足，且 CI 能产出纯 Rust / FFmpeg 双版本 |

## 验证矩阵

| 改动范围                        | 最低验证                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 文档、路线图、sidebar           | `npm run docs:build`                                                                                   |
| 插件 SDK、manifest、入站模型    | `npm run test:run -- tests/services/pluginService.test.ts tests/electron/pluginCatalog.test.ts`        |
| 本地音乐库 repository / SQLite  | `npm run test:native`                                                                                  |
| 原生音频协议和 Electron service | `npm run test:run -- tests/base/audioOutputProtocol.test.ts tests/electron/audioOutputService.test.ts` |
| Rust audio helper               | 对应 crate `cargo test` / helper build 脚本                                                            |
| 大范围结构调整                  | `npm run lint`、`npm run typecheck`、`npm run test:run`、`npm run build:web`                           |

## 关联文档

- [下一步优化路线图](/plans/next-optimization-roadmap)
- [本地音乐库架构](/architecture/local-library)
- [Rust 原生音频引擎](/architecture/native-audio-rust-engine)
- [插件体系拓展架构](/architecture/plugin-extension-architecture)
- [插件规范](/reference/plugin-specification)
- [项目结构优化详细规划](/plans/project-structure-optimization-plan)
- [Windows 原生 SMTC 实现计划](/plans/native-smtc-implementation-plan)
