---
layout: home

hero:
  name: 'LUO Music 文档'
  text: '开发指南、架构说明与审查归档'
  tagline: '保留高频文档在根层，把计划和报告下沉到子目录，减少 docs 根目录噪音。'
  actions:
    - theme: brand
      text: 快速开始
      link: /GETTING_STARTED
    - theme: alt
      text: 构建指南
      link: /build
    - theme: alt
      text: 项目概览
      link: /PROJECT

features:
  - title: 高使用频率
    details: 快速开始、构建、测试、VSCode 配置等开发常用文档继续保留在 docs 根层。
  - title: 架构说明
    details: 服务层、IPC、沙箱桥接、依赖注入和请求层等长期参考文档集中保留。
  - title: 计划归档
    details: 重构方案、迁移计划和结构调整提案统一收纳到 plans。
  - title: 报告归档
    details: 审核、分析、优化和复盘类文档统一收纳到 reports。
---

## 根层文档

### 开发指南

| 文档                         | 说明                             |
| ---------------------------- | -------------------------------- |
| [快速开始](/GETTING_STARTED) | 环境准备、安装与开发启动         |
| [构建指南](/build)           | Web / Electron / Server 构建说明 |
| [测试指南](/testing)         | 测试命令、策略与排查方式         |
| [项目概览](/PROJECT)         | 项目结构与模块职责               |
| [快速参考](/QUICK_REFERENCE) | 常用命令与配置速查               |
| [VSCode 配置](/vscode-setup) | 调试、任务与工作区配置           |
| [更新日志](/CHANGELOG)       | 项目与文档阶段性变更记录         |

### 架构与参考

| 文档                                          | 说明                            |
| --------------------------------------------- | ------------------------------- |
| [API 文档](/api-documentation)                | API 接口说明                    |
| [组件文档](/components-documentation)         | 组件使用说明                    |
| [错误处理](/error-handling)                   | 错误处理约定                    |
| [请求层说明](/request-usage)                  | 请求层使用约定                  |
| [服务层设计](/service-layer)                  | 服务层结构说明                  |
| [服务管理架构](/service-manager-architecture) | Service Manager 设计            |
| [沙箱服务](/sandbox-services)                 | Electron sandbox / preload 说明 |
| [统一 IPC 实现](/unified-ipc-implementation)  | IPC 落地实现说明                |
| [依赖图](/dependency-graph)                   | 依赖关系输出                    |
| [DI 性能监控](/di-performance-monitoring)     | 依赖注入与性能监控说明          |

## 归档目录

### `plans/`

| 文档                                                 | 说明                 |
| ---------------------------------------------------- | -------------------- |
| [架构重构计划](/plans/architecture-refactoring-plan) | 架构层面的重构计划   |
| [首页重构计划](/plans/home-refactor-plan)            | 首页相关改造方案     |
| [Player Store 重构](/plans/player-store-refactoring) | 播放器状态层改造计划 |
| [统一 IPC 方案](/plans/unified-ipc-plan)             | IPC 统一化设计方案   |
| [常量重构](/plans/refactoring/constants-refactoring) | 常量整理与收敛计划   |

### `reports/`

| 文档                                                                   | 说明                   |
| ---------------------------------------------------------------------- | ---------------------- |
| [多代理审核报告](/reports/multi-agent-review-2026-03-24)               | 本轮多子代理审查结论   |
| [复审报告](/reports/re-audit-report-2026-03-21)                        | 阶段性复审结果         |
| [代码审查报告](/reports/code-review-report)                            | 代码审查记录           |
| [优化总结](/reports/optimization-summary)                              | 优化结果汇总           |
| [VSCode 优化报告](/reports/optimization-report-vscode)                 | VSCode 相关优化记录    |
| [服务层差距报告](/reports/service-layer-gap-report)                    | 服务层缺口分析         |
| [VSCode 差距问题](/reports/vscode-gap-issues)                          | VSCode 侧问题整理      |
| [分析报告 v1](/reports/analysis-report)                                | 历史分析归档           |
| [分析报告 v2](/reports/analysis-report-v2)                             | 历史分析归档           |
| [分析报告 v3](/reports/analysis-report-v3)                             | 历史分析归档           |
| [IPC 性能监控](/reports/ipc-performance-monitoring)                    | IPC 性能监控说明       |
| [IPC 性能实现总结](/reports/ipc-performance-monitoring-implementation) | IPC 性能监控落地记录   |
| [IPC 日志优化](/reports/ipc-performance-logging-optimization)          | IPC 日志与监控优化记录 |

## 整理原则

- 高频使用的文档继续保留在 `docs/` 根层，避免日常查阅路径变深。
- 计划类文档统一收纳到 `docs/plans/`。
- 报告类文档统一收纳到 `docs/reports/`。
- 文档源码目录不保留 VitePress 缓存等生成产物。
