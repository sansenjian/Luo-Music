---
layout: home

hero:
  name: 'LUO Music 文档'
  text: '开发、架构、参考与归档的统一入口'
  tagline: '面向当前 Vue 3 + Vite + Electron 双端工程，按开发路径重新收敛文档结构，并将计划与报告独立归档。'
  actions:
    - theme: brand
      text: 开发指南
      link: /guide/
    - theme: alt
      text: 架构设计
      link: /architecture/
    - theme: alt
      text: 参考资料
      link: /reference/

features:
  - title: 开发指南
    details: 聚合快速开始、构建发布、测试、E2E 与 VSCode 工作流，优先服务日常开发。
  - title: 架构设计
    details: 聚合项目概览、服务层、IPC、错误处理、请求层与依赖图，便于理解系统边界。
  - title: 参考资料
    details: 聚合 API、组件与速查资料，降低从源码反推接口和组件行为的成本。
  - title: 计划与报告
    details: 方案、审计、评审与复盘全部下沉到独立归档区，避免主路径文档被历史材料淹没。
---

## 文档分区

### 开发指南

| 入口                                   | 说明                                     |
| -------------------------------------- | ---------------------------------------- |
| [开发指南总览](/guide/)                | 从安装、启动到构建、测试的主入口         |
| [快速开始](/guide/getting-started)     | 本地开发、Electron 调试与环境要求        |
| [构建与发布](/guide/build-and-release) | Web、Electron、portable 与 docs 构建链路 |
| [测试指南](/guide/testing)             | Vitest、Playwright 与回归验证约定        |
| [E2E 测试](/guide/e2e-testing)         | Playwright 入口和当前测试组织            |
| [VSCode 配置](/guide/vscode-setup)     | 本地调试与任务配置                       |

### 架构设计

| 入口                                             | 说明                                    |
| ------------------------------------------------ | --------------------------------------- |
| [架构总览](/architecture/)                       | 系统设计与关键模块入口                  |
| [项目概览](/architecture/project-overview)       | 模块边界、运行时形态与目录职责          |
| [服务层设计](/architecture/service-layer)        | 服务注册、依赖组织与调用边界            |
| [Service Manager](/architecture/service-manager) | Electron 子进程与服务生命周期           |
| [请求层说明](/architecture/request-layer)        | `src/utils/http` 的缓存、重试与取消机制 |
| [统一 IPC](/architecture/unified-ipc)            | preload / IPC 落地说明                  |

### 参考资料

| 入口                                   | 说明                     |
| -------------------------------------- | ------------------------ |
| [参考总览](/reference/)                | 速查与接口文档入口       |
| [快速参考](/reference/quick-reference) | 高频命令、目录和排查速查 |
| [API 文档](/reference/api)             | 平台与用户相关 API 说明  |
| [组件文档](/reference/components)      | 核心组件说明             |

### 归档区

| 入口                  | 说明                         |
| --------------------- | ---------------------------- |
| [计划总览](/plans/)   | 重构方案、迁移计划与执行路线 |
| [报告总览](/reports/) | 评审、审计、分析与复盘归档   |

## 整理原则

- 面向站点的路由按 `guide / architecture / reference / plans / reports` 分组。
- 高频开发路径优先落在指南与架构区，避免历史报告干扰日常查阅。
- 计划与报告统一归档，减少 `docs/` 根层噪音。
- `docs/.vitepress/dist` 视为生成产物，不再保留在源码目录。
