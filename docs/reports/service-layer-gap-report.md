# 服务层 + DI 差距报告

## 评估结论

- 基础设施完成度：约 40%
- 业务侧接入度：约 15–20%

## 已完成

- 服务注册与最小 DI（`setupServices` / `services.*()`）
- `LoggerService`、`ErrorService` 已在部分业务侧接入
- `ConfigService` 抽象已建（未使用）
- `PlatformService` 封装已建（少量使用）

## 主要差距

### 1. 业务侧仍直接依赖 platform

以下文件仍直接 `import platform` 或 `isElectron`：

- `src/views/Home.vue`
- `src/components/CacheManager.vue`
- `src/components/LyricFloat.vue`
- `src/components/Player.vue`
- `src/components/SettingsPanel.vue`
- `src/components/UserAvatar.vue`
- `src/store/playerStore.ts`

建议：统一改为 `services.platform()`，减少直接依赖。

### 2. ApiService 未接入

目前仍大量通过 adapter/axios 直接调用，`services.api()` 未落地到业务侧。

建议：先挑 1–2 个高频调用入口迁移，验证可行后再逐步扩展。

### 3. ConfigService 未落地

端口/URL 配置仍散落（QQ/Netease）。

建议：使用 `ConfigService` 统一读取并替换硬编码。

### 4. DI 仍为 Service Locator

目前属于“最小 DI”模式（service locator + override），还缺少：

- 作用域管理
- 生命周期管理
- 更严格的依赖注入规则

## 建议推进路径（最短）

1. 迁移所有 `platform` 直接依赖 → `services.platform()`
2. 选 1–2 个 API 调用入口接入 `services.api()`
3. 用 `ConfigService` 替换端口常量
