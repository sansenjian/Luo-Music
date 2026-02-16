# LUO Music - 快速启动指南

## 🎯 目标

本指南将帮助你在 5 分钟内启动 LUO Music 项目。

## 📋 步骤清单

- [ ] 安装 Node.js
- [ ] 安装 NeteaseCloudMusicApi
- [ ] 启动 API 服务
- [ ] 安装项目依赖
- [ ] 启动开发服务器
- [ ] 开始使用

## 1️⃣ 安装 Node.js

### 检查是否已安装
```bash
node --version
npm --version
```

如果显示版本号（>= 16.0.0），则已安装，跳到步骤 2。

### 下载安装
访问 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

## 2️⃣ 安装 NeteaseCloudMusicApi

### 方法一：使用 Git（推荐）
```bash
# 克隆仓库
git clone https://github.com/Binaryify/NeteaseCloudMusicApi.git

# 进入目录
cd NeteaseCloudMusicApi

# 安装依赖
npm install
```

### 方法二：手动下载
1. 访问 https://github.com/Binaryify/NeteaseCloudMusicApi
2. 点击 "Code" -> "Download ZIP"
3. 解压到任意目录
4. 在该目录打开终端，运行 `npm install`

## 3️⃣ 启动 API 服务

在 NeteaseCloudMusicApi 目录下运行：

### Windows (CMD)
```cmd
set PORT=36530 && node app.js
```

### Windows (PowerShell)
```powershell
$env:PORT=36530; node app.js
```

### macOS / Linux
```bash
PORT=36530 node app.js
```

看到以下信息表示启动成功：
```
server running @ http://localhost:36530
```

**⚠️ 重要：保持这个终端窗口打开，不要关闭！**

## 4️⃣ 安装项目依赖

打开**新的**终端窗口，进入 luo_music 目录：

```bash
cd luo_music
npm install
```

等待依赖安装完成（可能需要几分钟）。

## 5️⃣ 启动开发服务器

在 luo_music 目录下运行：

```bash
npm run dev
```

看到以下信息表示启动成功：
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## 6️⃣ 开始使用

1. 打开浏览器访问 `http://localhost:5173`
2. 在搜索框输入歌曲名称，如"你的猫咪"
3. 点击"搜索"按钮
4. 点击搜索结果中的歌曲开始播放
5. 享受音乐！🎵

## 🎉 成功！

现在你应该看到：
- ✅ API 服务运行在 http://localhost:36530
- ✅ 前端应用运行在 http://localhost:5173
- ✅ 可以搜索和播放音乐
- ✅ 可以查看实时同步的歌词

## 🔧 故障排除

### 问题 1：API 服务启动失败

**错误信息**：`Error: listen EADDRINUSE: address already in use :::36530`

**解决方法**：端口 36530 被占用，更换端口：
```bash
PORT=36531 node app.js
```

然后修改 `luo_music/src/utils/request.js` 中的 `baseURL`:
```javascript
baseURL: 'http://localhost:36531'
```

### 问题 2：前端启动失败

**错误信息**：`npm ERR! code ENOENT`

**解决方法**：
```bash
# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 问题 3：无法播放音乐

**可能原因**：
1. API 服务未启动
2. API 地址配置错误
3. 网络问题

**解决方法**：
1. 检查 API 服务是否运行：访问 http://localhost:36530
2. 检查浏览器控制台是否有错误
3. 尝试重启 API 服务和前端服务

### 问题 4：搜索无结果

**可能原因**：
1. 关键词不正确
2. API 服务异常
3. 网络连接问题

**解决方法**：
1. 尝试更换搜索关键词
2. 检查 API 服务日志
3. 检查网络连接

### 问题 5：歌词不显示

**可能原因**：
1. 该歌曲没有歌词
2. API 返回数据异常

**解决方法**：
1. 尝试播放其他歌曲
2. 查看浏览器控制台错误信息
3. 检查 API 响应数据

## 📞 获取帮助

如果遇到其他问题：

1. **查看文档**：阅读 `PROJECT.md` 和 `README.md`
2. **检查日志**：查看终端和浏览器控制台的错误信息
3. **搜索问题**：在 GitHub Issues 中搜索类似问题
4. **提交 Issue**：如果问题仍未解决，提交详细的问题描述

## 🎓 下一步

- 📖 阅读 [PROJECT.md](./PROJECT.md) 了解项目架构
- 🎨 自定义样式和主题
- 🔧 添加新功能
- 🚀 部署到生产环境

## 💡 小贴士

### 开发技巧
- 使用 Vue DevTools 浏览器扩展调试
- 修改代码后会自动热重载
- 使用 `console.log()` 调试问题

### 推荐搜索关键词
- 你的猫咪
- 晴天
- 七里香
- 稻香
- 夜曲

### 快捷键（计划中）
- `Space` - 播放/暂停
- `→` - 下一曲
- `←` - 上一曲
- `↑` - 增加音量
- `↓` - 减少音量

---

🎵 **祝你使用愉快！**
