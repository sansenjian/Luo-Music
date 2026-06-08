# 测试指南

LUO Music 目前同时使用 Vitest 和 Playwright 覆盖单测、集成测试、脚本测试与 E2E 场景。

## 测试命令

```bash
npm run test
npm run test:run
npm run test:native
npm run test:audio-output:exclusive
npm run test:audio-output:bit-perfect
npm run test:audio-output:format-matrix
npm run test:audio-output:remote-refresh
npm run test:audio-output:voicemeeter-route
npm run test:audio-output:mode-switch
npm run test:audio-output:loopback -- --source "D:\Music\source.wav" --capture "D:\Captures\loopback.wav"
npm run check:audio-output:windows-proof -- --proof-dir "D:\Captures\luo-audio-output"
npm run check:audio-output:helper-opus
npm run test:audio-output:helper-opus
npm run test:ci
npm run test:coverage
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
npm run typecheck
```

## Vitest and Vite+

项目已经通过本地 `vite-plus@0.1.20` 依赖接入 VP / Vite+ CLI，可用以下命令验证项目本地 CLI：

```bash
npm run vp:version
npm run vp:help
```

Vite+ 迁移期还提供质量检查入口：`npm run vp:lint`、`npm run vp:fmt:check` 与 `npm run vp:check`。这些命令读取根目录 `vite.config.ts` 中的 `lint` / `fmt` / `staged` 配置；应用开发和构建流程继续显式使用 `.config/vite.config.ts`。

单测配置集中在 `.config/vitest.config.ts`，并保留 node / jsdom 两个项目分组。`npm run test`、`npm run test:run`、`npm run test:coverage` 直接调用项目本地 Vitest，用于日常快速反馈和覆盖率统计。

只有真实打开 SQLite 的本地音乐库集成测试默认从快速测试中排除：`tests/electron/localLibrary.repository.test.ts` 和 `tests/electron/localLibrary.service.test.ts`。需要验证 repository / service 与 `better-sqlite3` 的真实集成时，运行 `npm run test:native`；完整 CI 本地复现使用 `npm run test:ci`。

`test:native` 会通过 `scripts/run-vitest-with-native-restore.cjs` 在测试前把 `better-sqlite3` 切到 Node 测试运行时，并在测试后恢复 Electron 运行时，避免 Node / Electron ABI 不匹配。不要用普通 `test:run` 去覆盖 native SQLite 用例。

本地音乐库数据库层已接入 Kysely 生成 typed SQL，但执行仍走 `better-sqlite3` native binding。Kysely compile、mapper、helper、handler、watch coordinator 和 scan engine 的纯逻辑测试应放在普通 `npm run test:run` 中；只有实例化 `LocalLibraryRepository`、打开真实 SQLite 文件或验证 schema 迁移时，才放入 `npm run test:native`。

`test:audio-output:exclusive` 是 Windows 硬件验证入口，会运行 WASAPI 真独占抢锁探针。`test:audio-output:bit-perfect` 会在抢锁探针基础上播放用户指定的本地音频文件，并读取 helper 回传的 bit-perfect candidate 诊断；设置 `LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT` 可把 candidate JSON 落盘，供后续 `test:audio-output:loopback -- --candidate ...` 合并验证。`test:audio-output:format-matrix` 会读取 helper 的 `supportedExtensions` / `supportedModes` 并输出 JSON 能力矩阵；`supportedModes` 可用于平台边界复核 Windows 的 shared / exclusive / voicemeeter 与 macOS / Linux 当前 shared-only 边界。设置 `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR` 后，会递归查找该目录下 helper 声明支持的扩展名样本，并逐个尝试启动 shared native 播放，用于把“支持格式”推进到真实样本证据；报告会包含 `startedSampleExtensions`、`failedSampleExtensions`、`sampleCoverage` 和逐样本 `samples` 明细，每个样本明细会包含 `byteSize` 与 SHA-256，设置 `LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT` 可保存矩阵 JSON。`LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES=1` 会要求每个 helper 声明支持的扩展名都有样本；`LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS` 或 `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST` 可声明本次必须覆盖的扩展名，缺样本时报告会变成 `missing-samples`。`test:audio-output:format-matrix:ffmpeg-samples` 会准备公开 FFmpeg 样本并跑真实样本启动矩阵；当 helper feature 含 `opus` / `opus-bundled`，或设置 `LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES=1` / 传入 `--include-opus-samples` 时，还会准备 `.opus` / `.webm` 样本覆盖可选 Opus 扩展。`test:audio-output:remote-refresh` 默认启动本地 mock CDN，验证过期远程 URL/headers 返回 `401` / `403` 后，fresh URL/headers 能通过 Range 或单响应请求拿到音频型 content type 和可缓存音频字节；如果设置 `LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL`、`LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS`、`LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL`、`LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS`，可把真实 Netease / QQ URL 续签结果放进同一验证入口；设置 `LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK=1` 后会把 fresh 音频落盘并通过 `audio-output-helper` shared native 路径启动播放，报告写入 `nativePlayback` 证明；设置 `LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT` 可把验证 JSON 落盘留证。`test:audio-output:voicemeeter-route` 会通过 helper 配置 Voicemeeter 模式、调用 Remote API 路由所选 bus、播放测试音、采样 Voicemeeter Remote API 输出电平，再生成非静音 WAV 并通过 native Voicemeeter `playFile` 启动，最后停止播放并等待路由恢复状态，输出 route JSON 供复核；`verdict: "routed-and-restored"` 需要明确的 `routeApplied: true`、`routeManaged: true`、匹配的 `routeBus`、已识别的 `remoteKind`、`virtualInputStrip`、播放期 `levelActivityDetected: true` / `levelProbe` 或匹配 path / token / requestedMode / activeMode 的 `nativePlayback.started: true`，以及停止后的 `routeRestored: true`；设置 `LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED=1` 可在确认测试音确实从目标 bus 听到后记录 `manualAudibilityConfirmed: true`，设置 `LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT` 可保存路由 / 恢复 JSON。`test:audio-output:mode-switch` 会在 Windows 上按 shared / exclusive / Voicemeeter / shared 默认顺序配置 helper、播放短静音 WAV、停止并记录每步 `playbackToken` / source，报告里的 `doublePlaybackFindings` 用于捕获下一模式开始后旧 token 仍处于 `starting` / `playing` / `paused` 的迹象；可设置 `LUO_AUDIO_OUTPUT_MODE_SWITCH_SEQUENCE`、`LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT`、`LUO_AUDIO_OUTPUT_MODE_SWITCH_VOLUME`、`LUO_AUDIO_OUTPUT_MODE_SWITCH_TIMEOUT_MS` 和 Voicemeeter HARDWARE OUT 环境变量调整验证。它只证明 helper 级切换序列，不替代 Electron UI、在线 URL、Voicemeeter 可听性或 bit-perfect 证据。`test:audio-output:loopback` 用于把外部采集到的 loopback WAV 与源 WAV 做采样级对比，默认同时要求 sample rate、声道、sample format、bit depth、完整源音频帧覆盖范围和样本内容一致；显式 `--compare-frames` 只代表子集对比，报告会标记 `partialComparison: true`。设置 `LUO_AUDIO_OUTPUT_LOOPBACK_REPORT` 或传入 `--report path\to\loopback.json` 可把 loopback / `candidate-plus-loopback` 报告落盘。它不负责采集，但能把候选诊断推进到可复查的 capture proof。`check:audio-output:verification-bundle` 会读取已经保存的 remote / Voicemeeter / candidate / loopback / format JSON 报告并输出 `complete` / `incomplete`，用于收尾前确认强证据是否齐全；设置 `LUO_AUDIO_OUTPUT_VERIFICATION_BUNDLE_REPORT` 或传入 `--report` 可保存最终汇总 JSON。默认不把 mock remote、manifest-only format、缺少逐样本启动明细、缺少样本 SHA-256，或 started 样本覆盖率低于 75% 的 format 报告当作最终证明；未覆盖格式会保留在 `missingSampleExtensions`，但在达到 75% 覆盖时不再单独阻止“大部分格式支持”证明，并且会要求单独传入的 candidate SHA-256 与 loopback 报告里的 source / embedded candidate SHA-256 一致，还会要求 candidate 报告记录 `bitPerfectRequired: true`。最终 loopback 证明不能是 `partialComparison: true`，也不能使用 `allowFormatConversion: true`，必须覆盖完整源范围并保持 sample format / bit depth 不变。remote 报告必须证明过期 URL / headers 被 `401` 或 `403` 拒绝，fresh URL / headers 返回可缓存音频字节和音频型 content type，并且 `nativePlayback.started: true` 证明 fresh 音频已由 native helper 启动；`remote-refresh-range` 还必须包含 `206` 和 `Content-Range`。Voicemeeter 报告必须证明请求 `bus` 与实际 `routeBus` 一致，带出已识别的 `remoteKind` 和 `virtualInputStrip`，播放期间目标 bus 输出电平超过阈值或 native Voicemeeter `playFile` 已启动，在 `restoreStatus` 中证明停止后 `routeManaged` 已释放，同时保留 `requiresManualAudibilityCheck: true` 并记录 `manualAudibilityConfirmed: true`。当前 Windows 收尾建议重复传入需要的 `--format` 报告，并用 `--require-format-platform win32` 要求 Windows 报告声明 shared / exclusive / Voicemeeter；可用 `--min-format-sample-coverage` 调整“大部分格式”阈值，默认 `0.75`，也可用 `--require-all-format-samples` 恢复 100% 全覆盖门槛；Linux / macOS 真机报告暂不作为本轮完成条件。`check:audio-output:helper-opus` 只验证 Rust helper 的 opt-in Opus feature 通过类型检查；`test:audio-output:helper-opus` 会进入链接阶段，用于验证系统 libopus 是否真正可链接，但仍不代表默认启用 Opus 或已经完成真实 `.opus` 样本播放验证。它们都不会进入普通 CI；运行条件、环境变量和结果解释见 [WASAPI 真独占测试](/native-audio-output-exclusive-test)。

这些会启动 `audio-output-helper` 的验证脚本默认使用 debug helper；当 `npm run dev:electron` 正在运行并锁住 `native/audio-output-helper/target/debug/audio-output-helper.exe` 时，可先构建 release helper：`node scripts/build/build-audio-output-helper.cjs --release --copy-resource --required`，再设置 `LUO_AUDIO_OUTPUT_HELPER_PATH=build\native\audio-output-helper.exe` 复用它。设置后脚本会跳过 debug build，并在 JSON 报告中记录实际 `helperPath` 与 `helperPathSource`。

`check:audio-output:windows-proof` 是 Windows 收尾复核的快捷入口。它默认从 `--proof-dir` 或 `LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR` 读取 `remote-refresh.json`、`voicemeeter-route.json`、`candidate.json`、`candidate-plus-loopback.json` 和 `format-matrix-win32.json`，强制要求 `win32` format report，并把最终 `audio-output-verification-bundle.json` 写回同一目录；它只读取报告文件，不会播放声音或修改设备。生成侧也支持同一个 `LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR`：在没有显式 `--report` 或各脚本 `*_REPORT` 时，remote refresh、Voicemeeter route、bit-perfect candidate、loopback、format matrix 和 mode switch 脚本会按上述标准文件名以及 `mode-switch.json` 写入该目录；`mode-switch.json` 是切换稳定性辅助证据，当前不作为 `windows-proof` 的硬性完成条件。

`tests/scripts/buildAudioOutputHelperScript.test.ts` 会模拟 macOS / Linux 的 `build-audio-output-helper.cjs --release --copy-resource --required`，确认无扩展名 helper 被复制到 `build/native/audio-output-helper` 并设置可执行位；这只证明 Electron helper 分发路径的脚本行为，不等于已经完成 macOS / Linux 真机播放验证。`tests/base/audioOutputProtocol.test.ts`、`tests/electron/audioOutputService.test.ts` 和 `tests/services/pluginService.test.ts` 会共同覆盖 `AudioOutputStatus.supportedModes`：协议层拒绝未知模式，main 进程按平台给出可用模式，设置 schema 按 helper 状态隐藏不可用模式并保留当前已选的历史值。

## 当前测试目录

```text
tests/
  api/
  app/
  base/
  components/
  composables/
  constants/
  e2e/
  electron/
  extensions/
  fixtures/
  helpers/
  mocks/
  platform/
  plugins/
  scripts/
  services/
  store/
  utils/
  views/
```

## 当前验证基线

截至 `2026-05-23`，最近一次验证结果为：

- `npm run test:run`：`198` 个测试文件通过，`1522` 个测试用例通过（1 个 fake timer 相关 flaky 测试已知）
- `npm run test:native`：只覆盖真实 SQLite repository / service 集成测试
- `npm run test:ci`：普通测试 + native 测试合并验证

## 什么时候必须补测试

- 修改 `src/store/`、`src/utils/`、`src/platform/` 核心逻辑时
- 修复缺陷且可以稳定复现时
- 变更构建脚本、Electron 路径、postinstall patch 时
- 调整请求层、错误处理、登录态和播放器核心行为时

## 推荐验证流程

### 功能或逻辑改动

```bash
npm run test:run
```

### 构建 / Electron 改动

```bash
npm run test:ci
npm run build:web
npm run build:electron
```

### 文档或 VitePress 改动

```bash
npm run docs:build
```

## E2E 说明

Playwright 相关命令：

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
```

如果本机还没有浏览器依赖，可先执行：

```bash
npx playwright install
```

## 调试建议

- `tests/setup.ts` 负责全局 Pinia 与浏览器环境初始化。
- 组件测试优先复用现有 mocks 和测试组织方式。
- 改动请求层时，优先写纯单测，不把网络依赖带进用例。
- E2E 失败时先看 `playwright-report/`，再回看浏览器控制台与网络请求。
