# 开发分支流程

本项目使用 `dev` 作为默认开发集成分支，`master` 作为稳定主分支。

## 分支职责

| 分支     | 职责                   | 更新方式                          |
| -------- | ---------------------- | --------------------------------- |
| `master` | 稳定主分支、发布基线   | 只接受 Pull Request               |
| `dev`    | 日常开发集成分支       | 优先接受 Pull Request             |
| 功能分支 | 功能、修复、文档等变更 | 从 `dev` 创建，完成后 PR 到 `dev` |

## 日常开发流程

```bash
git fetch origin
git switch dev
git pull --ff-only
git switch -c feature/your-feature-name
```

可使用的分支前缀：

| 前缀       | 用途             |
| ---------- | ---------------- |
| `feature/` | 新功能           |
| `fix/`     | 缺陷修复         |
| `docs/`    | 文档更新         |
| `chore/`   | 工具、依赖、维护 |
| `ci/`      | CI 配置          |

## 合并规则

- 普通开发变更：功能分支 -> PR -> `dev`。
- 稳定发布或主线同步：`dev` -> PR -> `master`。
- `master` 不直接 push。
- `dev` 也默认走 PR；只有仓库维护或紧急处理且用户明确要求时，才直接推送。
- 如果从 `master` 创建 hotfix 分支，合并到 `master` 后必须同步回 `dev`。

## 提交前检查

```bash
npm run quality
npm run test:run
```

涉及本地音乐库 SQLite native 路径时，额外运行：

```bash
npm run test:native
```

## PR 目标

- 面向日常开发、重构、依赖更新、文档更新的 PR，目标分支选 `dev`。
- 只有准备更新稳定主线时，目标分支才选 `master`。
- PR 描述应写清楚验证命令和影响范围。
