# 方案与路线图

本区只保留仍有执行价值的中长期计划。已完成的阶段记录、旧方案和一次性修复清单已从 `docs/plans/` 删除；历史结论如仍需追溯，优先查看 `docs/reports/`、Git 历史或对应架构说明页。

## 当前主线

| 优先级 | 文档                                                                 | 当前状态                                                           | 下一步                                                                            |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| P0     | [Windows 原生 SMTC 实现计划](/plans/native-smtc-implementation-plan) | Chromium SMTC 已完成一轮稳定性修复；Rust helper 尚未实现           | 先做 helper PoC，再接入 `builtin.smtc` fallback                                   |
| P0     | [下一步优化路线图](/plans/next-optimization-roadmap)                 | 汇总服务层 / DI 收口、插件系统增强和剩余风险                       | 先补插件 SDK 类型、入站模型 fixtures、登录兼容收口和边界自动检查                  |
| P1     | [项目结构优化详细规划](/plans/project-structure-optimization-plan)   | shared、IPC、Home、UserCenter 已部分收敛                           | 继续拆 `UserAvatar` 后续逻辑、`electron/local-library/service.ts` 和 feature 边界 |
| P1     | [插件体系拓展架构](/plugin-extension-architecture)                   | SDK、外部插件宿主、`ctx.secrets`、第一方 SMTC / cover-swipe 已落地 | 补 runtime hook 执行器、extension registry、桌面歌词 / 波形插件化                 |
| P1     | [插件规范](/plugin-specification)                                    | 当前插件 API 和 manifest 规范                                      | 随 SDK 能力变化同步更新                                                           |

## 后续优化

| 优先级 | 文档                                                         | 当前状态                                                   | 下一步                                           |
| ------ | ------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| P2     | [桌面歌词优化](/plans/desktop-lyric-optimization)            | 已有 snapshot、sequence 和 debug 能力，仍保留部分 fallback | 继续收敛为单一主数据源                           |
| P2     | [DI 后续路线图](/plans/di-followup-roadmap)                  | DI 主路线已完成，后续只做有收益的扩面                      | 继续迁移 `ApiService` 接入面和补自动检查         |
| P2     | [前端结构收口计划](/plans/frontend-structure-plan)           | composables/、components/、views/、features/ 边界梳理      | 先执行 P1 composables 分桶，再做 P2 组件归属迁移 |
| P2     | [打包瘦身计划](/plans/packaging-slimming-plan)               | 配置已做过一轮瘦身                                         | 重新打包后复核 `app.asar` 内容和体积             |
| P3     | [项目结构归属审计](/plans/project-structure-ownership-audit) | P0-A 审计记录                                              | 作为 feature 迁移参考，按需更新                  |

## 暂缓路线

| 文档                                                                  | 暂缓原因                                                         | 重新启动条件                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| [第一方音频输出插件方案](/plans/first-party-audio-output-plugin-plan) | WASAPI / miniaudio / Voicemeeter 涉及原生输出管线，风险高于 SMTC | 原生 helper 模型成熟，且明确需要 native audio 输出 |
| [npm 到 pnpm 迁移难度分析](/npm-to-pnpm-migration-analysis)           | 当前仍以 npm 和 `package-lock.json` 为准                         | Electron native rebuild、打包链路稳定后再切换      |
| [数据库层路线](/architecture/database)                                | Kysely 已解决当前 typed SQL 需求，Drizzle 仍是下一阶段           | 需要 schema / migration 管理时再做 Drizzle spike   |

## 已清理的计划文档

以下文件已从 `docs/plans/` 删除，避免继续误导后续路线判断：

| 已删除文档                               | 原因                                         |
| ---------------------------------------- | -------------------------------------------- |
| `architecture-refactoring-plan.md`       | 旧架构方案已被项目结构优化规划和当前实现覆盖 |
| `di-optimization-plan.md`                | DI Phase 1-3 已完成，后续转入 DI 后续路线图  |
| `home-refactor-plan.md`                  | Home feature 收敛已完成                      |
| `lyric-system-refactor-process.md`       | 歌词系统阶段性重构已完成                     |
| `player-store-refactoring.md`            | 属于历史重构报告，不再作为路线图维护         |
| `review-findings-fix-plan-2026-03-28.md` | 历史 review 修复项已关闭                     |
| `refactoring/constants-refactoring.md`   | 常量整理已完成，后续规则进入代码和架构文档   |
