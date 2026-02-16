# 🚀 LUO Music - 一键启动指南

## 快速启动（3 步）

### 第 1 步：启动 API 服务

打开终端，运行：

```bash
# Windows (PowerShell)
cd NeteaseCloudMusicApi
$env:PORT=36530; node app.js

# macOS / Linux
cd NeteaseCloudMusicApi
PORT=36530 node app.js
```

✅ 看到 `server running @ http://localhost:36530` 表示成功

⚠️ **保持这个终端窗口打开！**

---

### 第 2 步：启动前端应用

打开**新的**终端窗口，运行：

```bash
cd luo_music
npm run dev
```

✅ 看到 `Local: http://localhost:5173/` 表示成功

---

### 第 3 步：开始使用

1. 打开浏览器访问：http://localhost:5173
2. 在搜索框输入歌曲名称
3. 点击搜索结果开始播放
4. 享受音乐！🎵

---

## 📋 完整启动清单

- [ ] Node.js 已安装（>= 16.0.0）
- [ ] NeteaseCloudMusicApi 已下载
- [ ] API 服务已启动（端口 36530）
- [ ] 项目依赖已安装（`npm install`）
- [ ] 前端应用已启动（`npm run dev`）
- [ ] 浏览器已打开（http://localhost:5173）

---

## 🎯 推荐搜索关键词

试试搜索这些歌曲：
- 你的猫咪
- 晴天
- 七里香
- 稻香
- 夜曲
- 告白气球
- 青花瓷

---

## ⚡ 快捷命令

### 检查 Node.js 版本
```bash
node --version
npm --version
```

### 安装项目依赖
```bash
cd luo_music
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

---

## 🔧 常见问题

### Q: API 服务启动失败？
**A**: 端口 36530 可能被占用，尝试更换端口：
```bash
PORT=36531 node app.js
```
然后修改 `src/utils/request.js` 中的 `baseURL`。

### Q: 前端启动失败？
**A**: 删除 `node_modules` 重新安装：
```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: 无法播放音乐？
**A**: 检查：
1. API 服务是否运行
2. 浏览器控制台是否有错误
3. 网络连接是否正常

### Q: 搜索无结果？
**A**: 尝试：
1. 更换搜索关键词
2. 检查 API 服务日志
3. 确认网络连接

---

## 📞 获取帮助

遇到问题？查看：
- 📖 [README.md](./README.md) - 项目说明
- 📚 [PROJECT.md](./PROJECT.md) - 详细文档
- 🚀 [GETTING_STARTED.md](./GETTING_STARTED.md) - 启动指南
- 📝 [SUMMARY.md](./SUMMARY.md) - 项目总结

---

## 🎉 成功启动！

现在你应该看到：
- ✅ API 服务运行在 http://localhost:36530
- ✅ 前端应用运行在 http://localhost:5173
- ✅ 可以搜索和播放音乐
- ✅ 可以查看实时同步的歌词

**祝你使用愉快！** 🎵
