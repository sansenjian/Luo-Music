# Demo Plugin

Luo-Music 第三方插件示例，演示完整的插件接口实现。可作为开发新插件的参考模板。

## 安装

1. 启动 Electron 桌面端 (`npm run dev:electron`)
2. 侧边栏点击「插件」
3. 点击「浏览」选择本目录 (`plugins/examples/demo`) 或直接粘贴路径
4. 点击「安装」
5. 安装后在列表中找到 Demo Plugin，确认已启用
6. 在搜索平台下拉框中选择 "Demo Plugin"

## 功能

| 方法                | 支持 | 说明                                   |
| ------------------- | ---- | -------------------------------------- |
| `search`            | 是   | 返回模拟搜索结果，条目名包含搜索关键词 |
| `getSongUrl`        | 是   | 返回标准 `StandardSongUrl` 示例对象    |
| `getSongDetail`     | 是   | 返回模拟歌曲详情                       |
| `getLyric`          | 是   | 返回模拟 LRC 歌词 (含翻译)             |
| `getPlaylistDetail` | 否   | —                                      |

### 其他特性

- **storage** — 持久化记录累计搜索次数 (跨重启保留)
- **settings** — 支持最大结果数和详细日志开关
- **capabilitiesV2 / contributionsV2** — 演示新版能力与贡献元数据
- **PluginCallError** — 演示标准错误字段 (`code` / `userMessage` / `retryable`)
- **logger** — 所有操作输出结构化日志

## 文件结构

```
demo/
├── manifest.json   # 插件清单 (必需)
├── index.mjs       # 插件入口 (必需，ESM 格式)
└── README.md       # 说明文档 (推荐)
```

## 配置项

| 设置项     | 类型    | 默认值 | 说明                     |
| ---------- | ------- | ------ | ------------------------ |
| maxResults | select  | 10     | 每次搜索返回的最大结果数 |
| verbose    | boolean | false  | 开启后输出详细调试日志   |

## 开发新插件

1. 复制此目录作为起点
2. 修改 `manifest.json` 中的 `id`、`name`、`platformId`
3. 在 `capabilities` 中声明你的插件支持哪些方法
4. 在 `permissions.network.domains` 中声明需要访问的域名
5. 在 `index.mjs` 中实现对应的方法
6. 安装到 Luo-Music 中测试

详见项目根目录的 `docs/plugin-specification.md` 获取完整规范。
