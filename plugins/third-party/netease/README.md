# Netease Music Plugin

网易云音乐第三方插件，提供完整的音乐源功能。

## 安装

在 Luo-Music 侧边栏「插件」面板中浏览并选择此目录安装。

## 功能

- 搜索歌曲
- 获取播放地址 (支持多音质)
- 获取歌曲详情
- 获取歌词 (原文/翻译/音译)
- 获取歌单详情

## 前置依赖

需要运行 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 服务端 (默认端口 3000)。

## 配置

| 设置项     | 类型    | 默认值                | 说明         |
| ---------- | ------- | --------------------- | ------------ |
| apiBase    | text    | http://localhost:3000 | API 服务地址 |
| audioLevel | select  | standard              | 默认音质     |
| verboseLog | boolean | false                 | 详细日志     |

## 许可证

MIT
