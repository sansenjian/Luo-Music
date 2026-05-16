# 数据库层路线

LUO Music 的桌面端本地音乐库继续使用 SQLite 存储扫描结果、文件夹状态和封面引用。当前阶段先引入 Kysely 作为类型化 SQL query builder，后续再评估 Drizzle 承接 schema / migration 管理。

## 当前决策

- 运行时数据库仍是 `better-sqlite3`，因为 Electron 主进程需要稳定的同步 native SQLite 执行路径。
- Kysely 负责生成本地音乐库的 typed SQL，避免继续扩散手写动态 SQL 字符串。
- Repository 对外 API 暂不改成 async，`LocalLibraryService`、scan engine、watch coordinator 不需要跟随重构。
- Drizzle 暂不引入项目依赖。它更适合作为下一阶段 schema 定义、迁移文件和数据模型约束的候选。

## 代码入口

| 文件                                                    | 职责                                     |
| ------------------------------------------------------- | ---------------------------------------- |
| `electron/local-library/repository.types.ts`            | SQLite 表结构的 TypeScript schema 类型   |
| `electron/local-library/repository.kysely.ts`           | Kysely 查询构建器和分页查询 SQL 生成     |
| `electron/local-library/repository.ts`                  | 执行 SQL、管理事务、映射本地音乐库状态   |
| `tests/electron/localLibrary.repository.kysely.test.ts` | 验证 Kysely 生成 SQL、参数顺序和搜索转义 |

## 迁移边界

Kysely 当前只进入读查询中动态 SQL 风险较高的部分：

- 歌曲分页查询：`getTracksPage`
- 艺术家拆分匹配前的批量歌曲查询
- 专辑汇总分页查询：`getAlbumsPage`

写入路径继续保留 `better-sqlite3` prepared statements：

- 文件夹 upsert / enable / delete
- 曲目 upsert / delete
- 扫描事务和 native rebuild 流程

这样可以先拿到类型化查询收益，同时避免把本地音乐库扫描链路一次性改成异步数据库访问。

## 新查询约定

- 新增 SQLite 查询优先写在 `repository.kysely.ts`，除非是固定 SQL 的热路径 prepared statement。
- 表字段类型先更新 `repository.types.ts`，再写 Kysely 查询。
- Kysely 只负责 `compile()` 生成 SQL；执行仍通过 `LocalLibraryRepository` 内部的 `better-sqlite3` 连接完成。
- 涉及 `LIKE` 的搜索必须保留 `%`、`_`、`\` 转义，并补测试确认参数。
- Kysely compile、mapper、helper、handler、watch coordinator 和 scan engine 的纯逻辑测试走普通 `npm run test:run`。
- 只有真实打开 SQLite 文件、实例化 `LocalLibraryRepository` 或验证 schema 迁移时，才走 `npm run test:native`，不要绕过 `scripts/run-vitest-with-native-restore.cjs`。

## Drizzle 后续路线

Drizzle 推荐在下一阶段进入，优先解决 schema 和 migration 可维护性，而不是立即替换所有 repository 查询。

建议顺序：

1. 在独立 spike 中用 Drizzle 描述 `local_library_folders` 和 `local_library_tracks`。
2. 对比 Drizzle migration 输出与当前手写建表 SQL，确认不会破坏已有用户数据库。
3. 把 `cover_hash` 这类增量列迁移改成版本化 migration。
4. 保留 Kysely 查询层，或只把简单 CRUD 查询迁到 Drizzle；分页、搜索、汇总查询可继续由 Kysely 负责。
5. 完成回滚脚本和真实旧库升级测试后，再决定是否让 Drizzle 成为主数据库层。

## 验证命令

```bash
npm run test:run -- tests/electron/localLibrary.repository.kysely.test.ts
npm run test:native -- tests/electron/localLibrary.repository.test.ts tests/electron/localLibrary.service.test.ts
npm run typecheck
```
