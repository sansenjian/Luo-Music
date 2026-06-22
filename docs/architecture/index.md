# 架构设计

本区收敛 LUO Music 的模块边界、运行时形态和跨端设计约束。

## 重点主题

| 文档                                                        | 说明                                               |
| ----------------------------------------------------------- | -------------------------------------------------- |
| [项目概览](/architecture/project-overview)                  | 目录职责、运行模式与核心模块                       |
| [服务层设计](/architecture/service-layer)                   | 服务注册表、依赖组织与调用约束                     |
| [Service Manager](/architecture/service-manager)            | Electron 子进程与本地服务编排                      |
| [请求层说明](/architecture/request-layer)                   | `src/utils/http` 的缓存、重试、取消与 cookie 注入  |
| [数据库层路线](/architecture/database)                      | 本地 SQLite、Kysely 和后续 Drizzle 迁移边界        |
| [本地音乐库](/architecture/local-library)                   | 本地扫描、分页、去重索引、元数据候选和封面边界     |
| [错误处理](/architecture/error-handling)                    | 错误归一化与上报边界                               |
| [Sandbox 服务](/architecture/sandbox-services)              | preload / sandbox 服务桥接                         |
| [统一 IPC](/architecture/unified-ipc)                       | IPC 通道与渲染进程边界                             |
| [插件拓展架构](/architecture/plugin-extension-architecture) | 插件标准模型、登录、权限、贡献点和迁移边界         |
| [Rust 原生音频引擎](/architecture/native-audio-rust-engine) | Rust helper 工作区、能力握手和 FFmpeg fallback     |
| [SMTC 集成](/architecture/smtc)                             | Windows 系统媒体控制插件化和 Electron feature 边界 |
| [依赖图](/architecture/dependency-graph)                    | 当前依赖关系输出                                   |
| [DI 性能监控](/architecture/di-performance-monitoring)      | 依赖注入与性能观测说明                             |
