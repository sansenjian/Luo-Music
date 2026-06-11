# Scripts 目录结构

本目录包含项目的所有构建、开发和工具脚本。

## 📁 目录结构

```
scripts/
├── README.md           # 本说明文件
├── build/              # 构建相关脚本
│   ├── clean.cjs       # 统一清理入口
│   ├── clean-targets.cjs # 定向清理构建产物（Windows 优化）
│   ├── run-target.cjs  # build / make / package 调度入口
│   ├── build-smtc-helper.cjs # 构建 Windows SMTC Rust helper
│   ├── package-third-party-plugins.cjs # 生成第三方插件安装 zip
│   ├── check-artifact-budgets.cjs # 检查打包产物体积预算
│   └── finalize-portable-output.cjs # 收敛单文件便携版输出，只保留 .exe
│
├── dev/                # 开发环境脚本
│   ├── dev-electron-launcher.cjs  # Electron 开发启动器
│   └── qq-api-server.cjs          # QQ 音乐 API 服务（端口 3200）
│
├── runtime/            # 开发与打包共用运行时脚本
│   ├── netease-api-server.cjs     # 网易云 API 服务（端口 14532）
│   ├── qq-api-server.entry.cjs    # QQ 音乐打包入口
│   └── qq-search-fallback.cjs     # QQ 搜索兜底实现
│
└── utils/              # 工具脚本
    ├── analyze-deps.js     # 依赖分析工具
    ├── copy-deps.cjs       # 依赖复制工具
    └── kill-and-clean.js   # 进程清理工具
```

## 🚀 使用方式

### 构建脚本

```bash
# 清理构建产物
npm run clean

# 清理所有（包括 node_modules）
npm run clean:all

# 构建单文件便携版
npm run build:electron:portable
```

### 工具脚本

```bash
# 分析依赖
npm run analyze:deps

# 检查未使用依赖
npm run check:unused
```

### 开发脚本

开发脚本通常通过 npm scripts 自动调用：

```bash
# 启动开发服务器（包含 API 服务）
npm run dev:server

# 启动 Electron 开发环境
npm run dev:electron
```

## 📝 脚本详细说明

### build/

#### clean.cjs

统一清理入口，复用 `clean-targets.cjs` 的 Windows 文件锁定处理能力。

**参数：**

- `--force`: 自动结束占用进程
- `--all`: 删除 node_modules
- 额外路径参数：只清理指定路径

**使用示例：**

```bash
node scripts/build/clean.cjs --force
node scripts/build/clean.cjs --all
node scripts/build/clean.cjs dist build/service
```

**功能：**

1. 强制结束 Electron 相关进程
2. 使用重命名策略绕过文件锁定
3. 清理构建产物目录

#### run-target.cjs

构建调度入口，承载 `package.json` 中较长的 build / make / package 流程。

**常用目标：**

- `build`: Electron bundle 构建
- `web`: Web 构建
- `electron-bundle`: 清理并构建 Electron bundle
- `electron-bundle-no-clean`: 不清理，直接构建 Electron bundle
- `electron`: 生成 Electron 分发包
- `electron-portable`: 生成单文件便携版
- `electron-all`: 准备一次 Electron bundle，并行生成安装包和 portable
- `package`: 生成 Electron package
- `make`: 生成 Electron 分发包
- `make-fast`: 快速 make 模式

`electron`、`electron-portable`、`package` 和 `make-fast` 会在 Electron bundle 准备阶段并行生成 `out/third-party-plugins/*.zip`，插件页可使用这些 zip 重新安装内置平台插件。

`electron-all` 用于完整打包：共享一次 bundle 和插件 zip，然后并行执行 Forge make 与 electron-builder portable，完成后运行产物体积预算检查。

Forge make 默认生成 zip 分发包。Windows Squirrel maker 保留为显式 opt-in，可设置 `LUO_ENABLE_SQUIRREL_MAKE=1` 后再运行 Forge make；当前 Electron 41 主程序体积会触发 `electron-winstaller` 内置 NuGet 2.8 / Squirrel.Windows SharpCompress 对大 exe 的兼容问题，因此默认发布链路不再启用 Squirrel。

#### check-artifact-budgets.cjs

检查 `build/`、`out/portable/` 和 `out/third-party-plugins/` 等打包产物的大小；Electron 安装包目录 `out/make/` 按单个 zip / setup / nupkg 文件分别检查，避免把多个分发包总和误判为单包超限。默认只输出 warning；传入 `--strict` 或设置 `LUO_ARTIFACT_BUDGET_STRICT=1` 时，超限或缺失产物会让脚本失败。

#### package-third-party-plugins.cjs

将 `plugins/third-party/` 下的每个插件目录打包为稳定 zip 输出。脚本会校验 manifest、入口文件和输出目录边界，默认只写入 `out/third-party-plugins/`。

#### build-smtc-helper.cjs

构建 `native/smtc-helper` Rust helper。开发入口默认构建 debug helper；Electron 打包流程使用 `--release --copy-resource --required` 生成 release helper 并复制到 `build/native/smtc-helper.exe`，随后由 Forge / electron-builder 作为 `resources/native/smtc-helper.exe` 打进安装包。

#### build-audio-output-helper.cjs

构建 `native/audio-engine` workspace 内的 `audio-output-helper` Rust helper。开发入口默认构建当前平台 debug helper；Electron 打包流程使用 `--release --copy-resource --required` 生成 release helper 并复制到 `build/native/`。Windows 文件名为 `audio-output-helper.exe`，macOS / Linux 文件名为 `audio-output-helper`，复制后会显式设置可执行位，随后由 Forge / electron-builder 作为 `resources/native/` 下的同名二进制打进安装包。

可设置 `LUO_AUDIO_OUTPUT_HELPER_FEATURES` 透传 Cargo features，例如 `LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus` 使用系统 libopus 的 Opus 解码 adapter，或 `LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus-bundled` 启用 bundled libopus；系统 libopus 路线需要可链接的 `opus.lib` / `libopus`，bundled 路线需要 CMake。`--ffmpeg` 会额外启用 `ffmpeg` feature；复制 resource 时输出 `audio-output-helper-ffmpeg(.exe)`，用于 full helper 发布。Windows 上该路线需要 vcpkg 可发现的 FFmpeg，或 FFmpeg dev libs + `pkg-config` 能找到 `libavutil` / `libavcodec` / `libavformat` / `libswresample`。

音频输出验证脚本默认会构建并使用 `native/audio-engine/target/debug/` 下的 debug helper。如果 Electron 开发进程正在占用该 debug helper，可先运行 `node scripts/build/build-audio-output-helper.cjs --release --copy-resource --required`，再设置 `LUO_AUDIO_OUTPUT_HELPER_PATH=build\native\audio-output-helper.exe` 复用 release helper。设置该变量后验证脚本会跳过 debug build，报告中的 `helperPath` / `helperPathSource` 会记录实际使用路径。

`npm run check:audio-output:helper-opus` 是当前 Opus opt-in 类型检查入口，等价于对 helper 运行 `cargo check --features opus`。`npm run test:audio-output:helper-opus` 会运行 `cargo test --features opus --no-run`，用于验证系统 libopus 是否能真正进入链接阶段。

#### test-audio-output-format-matrix.cjs

原生音频格式矩阵验证入口。脚本会先构建并启动 `audio-output-helper`，读取 helper 回传的 `supportedExtensions` 和 `supportedModes`，输出 `verdict: "manifest-only"` JSON 报告。`supportedModes` 可用于平台边界复核：Windows 应包含 shared / exclusive / voicemeeter，macOS / Linux 当前应只声明 shared。设置 `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR` 后，脚本会递归查找该目录下 helper 声明支持的扩展名样本，并逐个尝试启动 shared native 播放；所有样本都进入 `starting` / `playing` / `ended` 状态时输出 `verdict: "samples-started"`，失败样本输出 `sample-failures`。报告会包含 `sampledExtensions`、`startedSampleExtensions`、`failedSampleExtensions`、`sampleCoverage` 和逐样本 `samples` 明细；每个样本明细会带 `byteSize` 与 SHA-256，方便复核样本文件身份。若启用完整覆盖要求但缺少样本，会输出 `missing-samples`；若期望扩展名不在 helper 声明里，会输出 `unsupported-expected-formats`。这些失败 verdict 会以退出码 `2` 标记。

可设置 `LUO_AUDIO_OUTPUT_TEST_DEVICE_ID` 指定测试设备，`LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES` 指定 buffer，`LUO_AUDIO_OUTPUT_FORMAT_VOLUME` 指定样本验证音量（默认 `0`，避免测试时出声），`LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_TIMEOUT_MS` 调整单个样本启动超时，`LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT=path\to\format-matrix.json` 保存矩阵报告。`LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES=1` 会要求 helper 声明的每个扩展名都有样本；`LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS=.wav,.flac` 可指定本次必须覆盖的扩展名；`LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST=path\to\manifest.json` 可用 JSON 数组或 `{ "expectedExtensions": [...] }` 声明期望扩展名。样本启动只证明 helper 能完成该文件的解码 / 播放初始化，不等于完整曲目播放、bit-perfect 或所有 codec 变体都已验证。

若只设置 `LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR` 且没有设置各脚本自己的 `*_REPORT` 环境变量，remote refresh、Voicemeeter route、bit-perfect candidate、loopback、format matrix 和 mode switch 脚本会分别按 `remote-refresh.json`、`voicemeeter-route.json`、`candidate.json`、`candidate-plus-loopback.json`、`format-matrix-win32.json`、`mode-switch.json` 写入同一个 Windows 证据目录，方便后续直接运行 `check:audio-output:windows-proof`。其中 `mode-switch.json` 是三种原生输出切换稳定性的辅助证据，当前不会被 `check:audio-output:windows-proof` 作为硬性完成条件。

#### test-audio-output-format-matrix-ffmpeg-samples.cjs

公开 FFmpeg samples 矩阵验证入口。脚本会下载一组固定的 `https://samples.ffmpeg.org` 测试音频到临时目录或 `--sample-dir` / `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_CACHE_DIR` 指定目录，并复用 `test-audio-output-format-matrix.cjs` 跑真实样本启动验证。默认用于“大部分格式支持”证据，非必需格式失败会写入报告；传入 `--require-all-samples` 时才会设置 `LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES=1`，恢复严格全覆盖验证。`.aiff`、`.m2a`、`.mpa`、`.oga` 会由同编码 / 同容器家族的基础样本复制生成，用于覆盖 helper 当前声明的扩展名。

当 `LUO_AUDIO_OUTPUT_HELPER_FEATURES` 包含 `opus` / `opus-bundled`，或显式传入 `--include-opus-samples` / 设置 `LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES=1` 时，脚本还会准备 `.opus` 与 `.webm` 样本，避免启用 Opus decoder 后缺少可选格式样本。默认 helper 不声明 `.opus` / `.webm` 时不会下载这些可选样本。

```bash
npm run test:audio-output:format-matrix:ffmpeg-samples
npm run test:audio-output:format-matrix:ffmpeg-samples -- --sample-dir D:\Captures\luo-format-samples --report D:\Captures\format-matrix-win32.json
npm run test:audio-output:format-matrix:ffmpeg-samples -- --include-opus-samples --sample-dir D:\Captures\luo-format-samples --report D:\Captures\format-matrix-win32.json
```

该入口会生成样本 manifest，记录源 URL、字节数和 SHA-256；默认临时样本目录会在成功/失败后删除，显式 `--sample-dir` 或 `--keep-samples` 会保留样本，方便和报告一起归档。它仍然只证明这些公开样本能启动 native 解码 / 播放初始化，不等同于所有 codec profile、损坏文件、超长曲目或 bit-perfect 证明。

#### test-audio-output-voicemeeter-route.cjs

Windows-only Voicemeeter Remote API 路由验证入口。脚本会先构建 `audio-output-helper`，再配置 Voicemeeter 模式、路由所选 bus、播放测试音、采样 Voicemeeter Remote API 输出电平，然后生成一段非静音 WAV 并通过 native `playFile` 在 Voicemeeter 模式启动，最后停止播放并等待 helper 回传路由恢复状态。`verdict: "routed-and-restored"` 需要 helper 回传明确的 `routeApplied: true`、`routeManaged: true`、`routeBus` 与请求 bus 一致、`remoteKind` 为 Standard / Banana / Potato 之一、带出被管理的 `virtualInputStrip`，并且停止后 `routeRestored: true`；报告还会包含 `levelActivityDetected` / `levelProbe` 以及 `nativePlayback`，用于证明测试音播放期间目标 bus 的 Remote API 输出电平超过阈值，或证明 native Voicemeeter `playFile` 已在匹配 token/source 下进入 `starting` / `playing` / `ended`。最终证据仍需要人工确认测试音确实从目标 Voicemeeter bus 听到，并通过 `LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED=1` 记录为 `manualAudibilityConfirmed: true`。

可设置 `LUO_AUDIO_OUTPUT_TEST_DEVICE_ID` 指定测试设备，`LUO_AUDIO_OUTPUT_VOICEMEETER_BUS` 指定 bus（默认 `A1`），`LUO_AUDIO_OUTPUT_TEST_DURATION_MS` 和 `LUO_AUDIO_OUTPUT_TEST_FREQUENCY_HZ` 调整测试音时长与频率，`LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED=1` 记录人工可听确认，`LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT=path\to\voicemeeter-route.json` 保存路由 / 恢复报告。

#### test-audio-output-mode-switch.cjs

Windows-only 原生输出模式切换验证入口。脚本会先构建并启动 `audio-output-helper`，默认按 shared / exclusive / Voicemeeter / shared 顺序逐步 configure、播放短静音 WAV、停止播放，并记录每一步的 `playbackToken`、source、requested / active mode 和终止状态。报告输出 `verdict: "switched"` 需要所有步骤都在请求模式下进入 `starting` / `playing` / `ended`，且下一步开始后没有旧 token/source 再回到 `starting` / `playing` / `paused` 的 `doublePlaybackFindings`；旧 token 的 `stopped` / `ended` / `error` 会被保留为 `staleEventFindings`，用于复核切换时是否还有延迟终止事件。

可设置 `LUO_AUDIO_OUTPUT_MODE_SWITCH_SEQUENCE=shared,exclusive,voicemeeter,shared` 调整序列，`LUO_AUDIO_OUTPUT_TEST_DEVICE_ID` 指定测试设备，`LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES` 指定 buffer，`LUO_AUDIO_OUTPUT_MODE_SWITCH_VOLUME` 指定验证音量（默认 `0`），`LUO_AUDIO_OUTPUT_MODE_SWITCH_TIMEOUT_MS` 调整单步启动超时，`LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT=path\to\mode-switch.json` 保存报告。Voicemeeter 步骤会透传 `LUO_AUDIO_OUTPUT_VOICEMEETER_BUS` 以及 `LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_BUS`、`LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DRIVER`、`LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DEVICE`，方便同时复核 HARDWARE OUT 配置链路。该脚本只证明 helper 级模式切换序列，不替代 Electron UI 操作、在线 URL 续签、Voicemeeter 人工可听确认或 bit-perfect loopback / DAC 证明。

#### test-audio-output-remote-refresh.cjs

在线 native 输出的远程 URL 续签验证入口。默认会启动本地 mock CDN，先用 expired URL / headers 验证 `403`，再用 fresh URL / headers 验证 Range 请求能拿到 `206 Content-Range`、音频型 `Content-Type` 和音频字节，输出 `verdict: "refreshable"` / `"not-refreshable"` JSON 报告。真实平台验证时，如果 CDN 忽略 Range 但返回 `200`、音频型 `Content-Type` 和可缓存音频字节，也会作为 single-response cache 前置条件通过；`text/html`、`application/json` 等登录页或错误 payload 不会被当成有效音频。设置 `LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK=1` 后，脚本会再完整拉取 fresh 音频、写入临时缓存文件，并启动 `audio-output-helper` 的 native `playFile` 路径；报告会包含 `nativePlayback.started`、`nativePlaybackState`、`requestedMode`、`activeMode`、缓存文件字节数和 SHA-256。最终证据包要求这层 native playback 证明。

可设置 `LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL`、`LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS`、`LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL`、`LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS` 做真实平台 URL 验证；headers 环境变量使用 JSON 对象，例如 `{"Authorization":"Bearer token","Cookie":"MUSIC_U=..."}`。脚本会自己生成 `Range` header，`LUO_AUDIO_OUTPUT_REMOTE_RANGE` 可覆盖默认的 `bytes=0-65535`；`LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK=1` 会启用 helper 播放证明，`LUO_AUDIO_OUTPUT_REMOTE_NATIVE_MODE=exclusive` 可把播放证明切到 WASAPI 真独占（默认 `shared`，也接受 `voicemeeter`），`LUO_AUDIO_OUTPUT_REMOTE_NATIVE_TIMEOUT_MS` 可调整等待时长。设置 `LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT=path\to\remote-refresh.json` 可保存验证报告。

#### verify-audio-output-loopback.cjs

对比源 WAV 与外部采集到的 loopback WAV，输出 `verified` / `not-verified` JSON 报告。它用于补足 `test:audio-output:bit-perfect` 的候选诊断：候选脚本证明当前播放满足格式条件，loopback 对比器默认验证 sample rate、声道、sample format、bit depth、完整源音频帧覆盖范围和 capture 样本都与源文件一致。报告会带出 source / capture 的字节数和 SHA-256，方便保存后复核文件身份；传入 `--candidate candidate.json` 时，candidate 必须是 `verdict: "candidate"`、`proof: "candidate-only"`、`requiresExternalVerification: true`，并带有 `audioFileIdentity.sha256`，脚本会校验 candidate 源文件 SHA-256 并输出 `candidate-plus-loopback` 合并证明。传入 `--report path\to\loopback.json` 或设置 `LUO_AUDIO_OUTPUT_LOOPBACK_REPORT=path\to\loopback.json` 可把同一份 JSON 报告落盘，报告内会包含 `reportPath`。脚本不负责录音采集，也不能证明 capture 文件一定来自本次播放。若录音工具只能导出不同 sample format / bit depth 的 WAV，可显式传入 `--allow-format-conversion` 改为比较归一化样本值，但证明强度会降低；若显式传入 `--compare-frames` 做子集对比，报告会标记 `partialComparison: true`，不应当当作完整曲目的 bit-perfect 证明。

`test-audio-output-bit-perfect-candidate.cjs` 可设置 `LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT=path\to\candidate.json` 保存候选报告。没有现成匹配设备独占格式的源 WAV 时，可设置 `LUO_AUDIO_OUTPUT_BIT_PERFECT_AUTO_WAV=1`，脚本会先用静音探测读取 WASAPI exclusive 输出格式，再生成匹配 sample rate / channel / sample format / bit depth 的短 WAV 作为 raw PCM passthrough 候选源；若同时设置报告路径，生成的源文件会保留为同目录的 `*.source.wav`，也可用 `LUO_AUDIO_OUTPUT_BIT_PERFECT_AUTO_WAV_PATH=path\to\source.wav` 指定保存位置。推荐流程是先运行 candidate 脚本生成候选 JSON，再用外部工具采集 loopback WAV，最后运行 `npm run test:audio-output:loopback -- --source source.wav --capture capture.wav --candidate candidate.json --report candidate-plus-loopback.json` 生成并保存 `candidate-plus-loopback` 报告。若已经设置 `LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR`，且没有传入 `--report` / 各脚本 `*_REPORT`，这些报告会自动落到该目录的标准文件名。

设置页的“强制 bit-perfect 候选输出”会把 candidate 条件变成播放保护：开启后 helper 只允许 WASAPI 真独占 raw PCM passthrough candidate 启动，无法满足时直接报错，不会回退到 shared、Voicemeeter 或 decoded-f32 streaming 路径。脚本可通过 `LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE=1` 启用同一保护，并在报告中写入 `bitPerfectRequired` 和失败 `reason`。它用于防止降级播放，最终证明仍需要 loopback / DAC 报告。

#### check-audio-output-verification-bundle.cjs

读取已经保存的 remote refresh、Voicemeeter route、bit-perfect candidate、loopback 和 format matrix JSON 报告，输出 `complete` / `incomplete` 汇总。默认要求 remote 报告来自真实平台 URL（`mode: "live"`）、过期 URL / headers 被 `401` 或 `403` 拒绝、fresh URL / headers 返回可缓存音频字节和音频型 content type，若 proof 为 `remote-refresh-range` 则 fresh 响应还必须是 `206` 且带 `Content-Range`；remote 报告还必须包含 `nativePlayback.started: true`，证明刷新后的音频字节已落盘并由 `audio-output-helper` 的 native 路径启动。可传入 `--require-remote-native-mode exclusive` 强制 `nativePlayback.requestedMode` 与 `nativePlayback.activeMode` 都是 WASAPI 真独占。Voicemeeter 为 `routed-and-restored`，请求 `bus` 与实际 `routeBus` 一致，`remoteKind` 为 Standard / Banana / Potato 之一，带出 `virtualInputStrip`，需要 `levelActivityDetected: true` / `levelProbe` 证明测试音播放期间目标 bus 输出电平超过阈值，或 `nativePlayback` 证明 native Voicemeeter `playFile` 已在匹配 path / token / requestedMode / activeMode 下启动；`restoreStatus.voicemeeterRemote.routeManaged` 为 `false`，保留 `requiresManualAudibilityCheck: true`，并记录 `manualAudibilityConfirmed: true`；candidate 为 `candidate-only` 成功候选，且必须记录 `bitPerfectRequired: true`；loopback 为 `candidate-plus-loopback` 且已验证，不能是 partial comparison，不能允许 sample format / bit-depth conversion；单独传入的 candidate SHA-256 与 loopback 报告里的 source / embedded candidate SHA-256 一致；format matrix 为真实样本启动的 `samples-started`，默认至少 75% helper 声明扩展名需要有成功启动样本，并且每个成功启动样本都带 `byteSize` 与 SHA-256。未覆盖或失败格式会保留在报告中；若要恢复 100% 全覆盖门槛，可传入 `--require-all-format-samples`。可通过 `--remote`、`--voicemeeter`、`--bit-perfect`、`--loopback`、重复 `--format` 显式传入路径，也可以复用各验证脚本的 `*_REPORT` 环境变量；传入 `--report path\to\verification-bundle.json` 或设置 `LUO_AUDIO_OUTPUT_VERIFICATION_BUNDLE_REPORT` 可把最终汇总报告落盘。当前 Windows 收尾建议传入 `--require-format-platform win32` 和 `--require-remote-native-mode exclusive`；Linux / macOS 报告可在后续跨平台验证时重复传入，并用 `--require-format-platform linux` / `darwin` 提升为必需项。

`--allow-mock-remote`、`--allow-format-manifest-only` 和 `--allow-partial-format-samples` 只用于本地 dry-run，不应作为最终 native 输出收尾证明。`--min-format-sample-coverage` 可调整“大部分格式”阈值，默认 `0.75`。

#### check-audio-output-windows-proof.cjs

Windows 当前收尾证据包快捷复核入口。脚本只读取已保存的 JSON 报告，不会播放声音或接触硬件。传入 `--proof-dir D:\Captures\luo-audio-output` 或设置 `LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR` 后，会按标准文件名读取 `remote-refresh.json`、`voicemeeter-route.json`、`candidate.json`、`candidate-plus-loopback.json` 和 `format-matrix-win32.json`，强制要求 accepted `win32` format report，并要求在线 remote native 证明的 `requestedMode` / `activeMode` 都是 `exclusive`，再把最终 `audio-output-verification-bundle.json` 写回同一目录。也可以用 `--remote`、`--voicemeeter`、`--bit-perfect`、`--loopback`、`--format`、`--min-format-sample-coverage`、`--require-all-format-samples` 和 `--report` 覆盖单个路径或格式覆盖策略；`LUO_AUDIO_OUTPUT_WINDOWS_PROOF_REPORT` 可单独指定最终报告路径。

#### finalize-portable-output.cjs

单文件便携版打包后处理脚本。

**功能：**

1. 检查 `out/portable/` 中是否恰好生成一个 `.exe`
2. 删除同目录下的其他文件或临时目录
3. 确保最终输出目录只保留单个便携版 `.exe`

### runtime/

#### netease-api-server.cjs

启动网易云音乐 API 服务，开发环境与打包产物共用。

**端口：** 14532（可通过 `PORT` 环境变量修改）

**功能：**

- 启动 NeteaseCloudMusicApi Enhanced
- 健康检查确认服务可用
- 支持进程间通信

#### qq-search-fallback.cjs

QQ 音乐搜索兜底实现，供开发服务和打包后的 QQ runtime 入口复用。

### dev/

#### qq-api-server.cjs

启动 QQ 音乐 API 服务。

**端口：** 3200（可通过 `PORT` 环境变量修改）

**功能：**

- 启动 @sansenjian/qq-music-api
- 使用用户数据目录避免权限问题
- 健康检查和进程通信

#### dev-electron-launcher.cjs

Electron 开发环境启动器。

**功能：**

- 管理 Electron 开发进程
- 热重载支持
- 错误处理和日志记录

### utils/

#### analyze-deps.js

依赖分析工具，生成详细报告。

**分析内容：**

1. 主要依赖版本检查
2. 安全漏洞扫描（npm audit）
3. 过时依赖检测
4. 未使用依赖检查
5. 依赖大小分析
6. 重复依赖检查

**优化建议：**

- 定期运行 `npm audit fix`
- 使用 `npm run update:deps` 更新依赖
- 检查未使用依赖
- 分析打包体积

#### copy-deps.cjs

依赖复制工具（CommonJS 模块）。

#### kill-and-clean.js

进程清理工具。

## 🔧 维护指南

### 新增脚本

1. **分类放置**：
   - 构建相关 → `build/`
   - 开发相关 → `dev/`
   - 工具脚本 → `utils/`

2. **命名规范**：
   - ESM 模块使用 `.js` 扩展名
   - CommonJS 模块使用 `.cjs` 扩展名
   - 使用 kebab-case 命名

3. **路径更新**：
   - 修改脚本位置后，更新 `package.json` 中的 scripts 路径
   - 确保路径计算正确（通常需要 `../../` 回到根目录）

### 路径计算示例

```javascript
// ESM 模块 (.js)
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..') // 回到项目根目录

// CommonJS 模块 (.cjs)
const path = require('path')
const projectRoot = path.resolve(__dirname, '..', '..')
```

## 📊 相关命令

```bash
# 查看依赖分析报告
npm run analyze:deps

# 更新依赖版本
npm run update:deps

# 检查未使用依赖
npm run check:unused

# 清理构建产物
npm run clean

# 完全清理（包括 node_modules）
npm run clean:all
```

## ⚠️ 注意事项

1. **Windows 文件锁定**：使用 `clean.cjs` 的 `--force` 参数可自动结束占用进程
2. **权限问题**：QQ API 服务会自动切换到用户数据目录，避免写入权限问题
3. **路径依赖**：所有脚本都使用相对路径计算，确保从任何位置调用都能正确定位
