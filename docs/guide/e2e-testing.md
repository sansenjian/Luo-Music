# E2E 测试

LUO Music 使用 Playwright 执行端到端测试，当前测试文件位于 `tests/e2e/`。

## 前置条件

首次运行前安装浏览器：

```bash
npx playwright install
```

## 命令

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
```

## 当前测试文件

| 文件                           | 说明                 |
| ------------------------------ | -------------------- |
| `tests/e2e/basic.spec.ts`      | 基础页面加载验证     |
| `tests/e2e/search.spec.ts`     | 搜索功能主流程       |
| `tests/e2e/player.spec.ts`     | 播放器核心流程       |
| `tests/e2e/web/search.spec.ts` | Web 场景下的搜索覆盖 |

## 调试建议

- 用 `npm run test:e2e:headed` 先确认 UI 流程是否稳定。
- 用 `npm run test:e2e:debug` 逐步排查选择器或异步时序问题。
- 失败后运行 `npm run test:e2e:report` 查看报告。

## 相关资料

- `tests/e2e/README.md`
- [测试指南](/guide/testing)
