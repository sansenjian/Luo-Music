# E2E 测试快速开始

## 安装

```bash
# 安装 Playwright 浏览器
npx playwright install
```

## 运行测试

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 有头模式（显示浏览器）
npm run test:e2e:headed

# 调试模式
npm run test:e2e:debug

# 查看测试报告
npm run test:e2e:report
```

## 测试文件

- `tests/e2e/basic.spec.ts` - 基础页面加载测试
- `tests/e2e/search.spec.ts` - 搜索功能测试
- `tests/e2e/player.spec.ts` - 播放器功能测试

## 注意事项

测试中的选择器需要根据实际 DOM 结构进行调整：

- `getByPlaceholder(/搜索/)` - 搜索输入框
- `getByTestId('song-list')` - 歌曲列表
- `getByTestId('player')` - 播放器容器
- `getByRole('button', { name: /播放 | 暂停/i })` - 播放/暂停按钮
