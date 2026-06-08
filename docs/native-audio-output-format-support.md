# 原生音频输出格式支持

这份矩阵描述 `feature/native-audio-output-plugin` 当前分支的 native 输出格式边界。它只代表 Rust helper 与播放器路由的当前实现，不等于“所有文件都能 bit-perfect 播放”。

## 当前规则

- 本地音乐库只会把扩展名在白名单内的音频文件交给 native helper。
- 在线歌曲拿到直接 HTTP(S) URL 后会先进入 main 进程缓存 / Range growing-cache 路线，再由 helper 解码；是否成功仍取决于实际容器和 codec。
- 对于 URL pathname 明确以 `.mkv` 结尾的在线歌曲，renderer 会提前保留 Chromium 播放，避免先缓存再触发 helper 解码失败；`.opus` / `.webm` 只有在 helper 状态明确报告 `supportedExtensions` 包含对应扩展名时才会进入 native。
- native 解码失败时播放器应停止 helper，并回退到 Chromium / `HTMLAudioElement` 播放。
- 如果设置页开启“强制 bit-perfect 候选输出”，远程 Range 音频会先完整缓存再启动 helper，helper 会拒绝 shared / Voicemeeter / decoded-f32 等降级路径；这会让许多可 native 解码格式不再播放，因为它们不是 raw PCM passthrough candidate。
- `.ape` 通过纯 Rust Monkey's Audio decoder 进入 native，但当前只支持常见 WAV-sourced PCM APE；带 big-endian、floating-point 或 signed-8-bit post-processing flags 的 APE 会被 helper 拒绝。远程 `.ape` 会完整缓存后再启动 helper，不走 growing-cache 首块播放。受支持 APE 在 Windows exclusive 且输出格式完全匹配时可作为 `APE decoded PCM raw passthrough` 的 bit-perfect 候选，但仍需要 loopback / DAC 状态证明。
- 视频容器和包含 Opus 轨道但当前 helper 未报告支持的 Matroska / WebM 文件暂不声明为 native 支持格式。

## 验证门槛

`npm run test:audio-output:format-matrix` 默认只读取 helper 的 `supportedExtensions` / `supportedModes` 能力清单；这会输出 `manifest-only`，不能当作真实格式支持证明。设置 `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR` 后，脚本才会逐个启动样本播放，并在报告里写入 `sampledExtensions`、`startedSampleExtensions`、`failedSampleExtensions`、`missingSampleExtensions`、`sampleCoverage` 和每个样本的启动状态。每个样本明细还会包含 `byteSize` 与 `sha256`，用于复核报告对应的真实样本文件。

本轮收尾目标是“大部分格式支持”，不是全格式承诺。证据包检查器默认要求 `samples` 明细中至少 75% helper 声明支持的扩展名有 `status: "started"` 样本，且每个成功启动样本都带有 `byteSize` 与 64 位 SHA-256；未覆盖格式会继续保留在 `missingSampleExtensions` / `missingStartedSampleExtensions` 里，作为后续缺口记录。如果要恢复“全格式支持”门槛，需要同时让 `missingSampleExtensions` 为空，并使用 `check:audio-output:verification-bundle --require-all-format-samples` 或 `check:audio-output:windows-proof --require-all-format-samples` 要求每个 helper 声明的扩展名都有 started 样本。推荐生成侧设置 `LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES=1`，或者通过 `LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS` / `LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST` 明确本次必须覆盖的扩展名；缺少样本时报告会输出 `missing-samples`，期望扩展名未被 helper 声明支持时会输出 `unsupported-expected-formats`。

如果本机没有现成样本目录，可以运行：

```bash
npm run test:audio-output:format-matrix:ffmpeg-samples
```

该入口会下载固定的公开 FFmpeg samples，覆盖当前默认 helper 声明的 `.aac`、`.aif`、`.aiff`、`.ape`、`.caf`、`.flac`、`.m2a`、`.m4a`、`.mka`、`.mp1`、`.mp2`、`.mp3`、`.mpa`、`.oga`、`.ogg`、`.wav` 扩展名，并以真实样本启动方式运行矩阵。它是可复跑的格式启动证据，但仍不等于所有 codec profile / 损坏样本 / 完整曲目播放都已覆盖；如果需要把它升级为 100% 全覆盖证明，再配合严格开关运行。

## 格式矩阵

| 扩展名 / 容器            | 典型 codec             | 本地 native 路由 | 在线 native 路由 | 说明                                                                                                                                                                                                     |
| ------------------------ | ---------------------- | ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.wav`                   | PCM / ADPCM            | 支持             | 尝试支持         | 取决于 Symphonia 可解码的 WAV codec。                                                                                                                                                                    |
| `.aif` / `.aiff`         | PCM / AIFF family      | 支持             | 尝试支持         | 作为 AIFF 音频文件处理。                                                                                                                                                                                 |
| `.caf`                   | PCM / AAC / ALAC 等    | 支持             | 尝试支持         | 仍取决于内部 codec 是否已由 helper 启用。                                                                                                                                                                |
| `.flac`                  | FLAC                   | 支持             | 尝试支持         | 常规 FLAC 路线。                                                                                                                                                                                         |
| `.mp1` / `.mp2` / `.m2a` | MPEG Layer I / II      | 支持             | 尝试支持         | 由 `mpa` / MPEG audio 支持覆盖。                                                                                                                                                                         |
| `.mp3` / `.mpa`          | MPEG Layer III / audio | 支持             | 尝试支持         | 常规 MP3 / MPEG audio 路线。                                                                                                                                                                             |
| `.aac`                   | AAC ADTS               | 支持             | 尝试支持         | 非 MP4 容器的 AAC 路线。                                                                                                                                                                                 |
| `.m4a`                   | AAC / ALAC             | 支持             | 尝试支持         | MP4/M4A 可能需要尾部 metadata，Range 首块不一定能秒开。                                                                                                                                                  |
| `.ogg` / `.oga`          | Vorbis                 | 支持             | 尝试支持         | 当前按 Ogg Vorbis 路线支持，不包含 Opus。                                                                                                                                                                |
| `.mka`                   | Matroska audio         | 支持             | 尝试支持         | 只声明音频容器；内部为 Opus 时仍会失败并回退。                                                                                                                                                           |
| `.ape`                   | Monkey's Audio         | 支持             | 完整缓存后尝试   | 通过 `ape-decoder` 解码为 streaming f32；exclusive 格式完全匹配时可走 APE decoded PCM raw passthrough 候选。当前拒绝 big-endian、floating-point 和 signed-8-bit post-processing 变体；仍需真实样本验证。 |
| `.opus`                  | Opus                   | 可选             | 可选             | 默认 helper 不启用；设置 `LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus` 可尝试系统 libopus，`opus-bundled` 会启用 bundled libopus 且需要 CMake。只有 helper 报告 `.opus` 能力后 renderer 才会放行。             |
| `.webm`                  | WebM audio / Opus      | 可选             | 可选             | 默认 helper 不启用；Opus feature 下 helper 会报告 `.webm`，renderer 才会放行。仍只适合音频轨道，真实支持取决于容器和 codec。                                                                             |
| `.mkv`                   | Matroska / 视频容器    | 不支持           | 提前回退         | 避免仅凭扩展名把视频或非音频 Matroska 交给 native；音频-only 路线优先使用 `.mka`。                                                                                                                       |

## 后续扩展顺序

当前 Windows 开发环境已通过 `npm run check:audio-output:helper-opus`，说明系统 libopus adapter 路线能通过 Rust 类型检查；但 `npm run test:audio-output:helper-opus` 会进入链接阶段，本机在没有可链接 `opus.lib` 时会失败。`cargo check --features opus-bundled` 也会因为缺少 `cmake` 失败。因此 Opus 仍只是可选候选路线，不进入默认验证门禁。若环境已经能构建 Opus helper，`test-audio-output-format-matrix:ffmpeg-samples` 可通过 `LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus`、`--include-opus-samples` 或 `LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES=1` 额外准备 `.opus` / `.webm` 样本，让样本矩阵覆盖 helper 新报告的可选扩展名；如需全覆盖，再加 `--require-all-samples`。

1. 先验证 Opus opt-in 构建条件：`opus` 需要系统可链接 libopus，`opus-bundled` 需要 CMake；本轮先通过 Windows 构建、包体预算和真实 `.opus` 样本后再考虑默认启用，macOS / Linux 可作为后续扩展验证。
2. 为 `.ape` 准备覆盖不同压缩级别、位深和声道的真实样本；只有矩阵报告 `samples` 明细证明 `.ape` 样本成功启动，才能把 APE 纳入“大部分格式支持”证据；若未来恢复“全格式支持”，还必须让 `missingSampleExtensions` 为空。
3. 对在线歌曲补远程鉴权续传、helper 直连 HTTP 流或 Chromium 解码桥后，再扩大“在线 native 支持”的承诺。
