# WASAPI 真独占测试

这份文档用于验证 LUO Music 的原生音频输出是否真的占用了 Windows 输出端点，而不是只在界面上显示“真独占模式”。

## 测试结论标准

项目内的真独占测试会执行一个 WASAPI 抢锁探针：

1. 在选定输出设备上打开第一条 `AUDCLNT_SHAREMODE_EXCLUSIVE` stream。
2. 写入静音缓冲并启动这条 stream，让它实际持有 endpoint。
3. 在第一条 stream 仍处于活动状态时，再尝试打开第二条 exclusive stream。
4. 如果第二次打开被 Windows 返回 `AUDCLNT_E_DEVICE_IN_USE` 拒绝，则判定为真独占锁有效。

这比“打开 QQ 音乐是否还有声音”的人工观察更稳定，因为它直接测试同一个 endpoint 是否会拒绝第二个 WASAPI exclusive client。

## 运行方式

默认测试使用 Windows 当前默认输出设备：

```bash
npm run test:audio-output:exclusive
```

如果要测试插件里选择的具体设备，在 PowerShell 里先设置设备 ID。设备 ID 与原生音频输出状态里的 `deviceId` 一致，通常形如 `0:扬声器 (Realtek(R) Audio)`：

```powershell
$env:LUO_AUDIO_OUTPUT_TEST_DEVICE_ID = '0:扬声器 (Realtek(R) Audio)'
npm run test:audio-output:exclusive
Remove-Item Env:\LUO_AUDIO_OUTPUT_TEST_DEVICE_ID
```

如需调整 exclusive buffer，可以设置：

```powershell
$env:LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES = '512'
npm run test:audio-output:exclusive
Remove-Item Env:\LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES
```

底层等价命令：

```bash
cargo test --manifest-path native/audio-output-helper/Cargo.toml exclusive_lock_probe_blocks_second_wasapi_client -- --ignored --nocapture
```

## 前置条件

- 只支持 Windows。其他系统会跳过 npm 脚本，因为 WASAPI exclusive 是 Windows Core Audio 能力。
- Windows 声音设备的“高级”设置里需要允许应用独占控制，并允许独占模式应用优先。
- 测试时不要让其他软件先占用同一个输出设备的独占模式。
- 蓝牙、虚拟声卡、远程桌面音频设备可能有驱动差异，失败时优先换有线声卡或系统默认扬声器复测。

## 结果解释

成功时会看到类似输出：

```text
WASAPI exclusive lock probe passed. device=扬声器 (Realtek(R) Audio), format=48000 Hz/2ch/24-bit pcm, buffer=512 frames, source=PCM fallback from unsupported mix format (...), secondOpen=AUDCLNT_E_DEVICE_IN_USE.
```

常见失败：

| 现象                                          | 含义                                  | 处理                                                   |
| --------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `AUDCLNT_E_DEVICE_IN_USE` 出现在第一条 stream | 已有其他应用占用了该 endpoint         | 关闭其他播放器、浏览器标签页、系统声音测试窗口后重试   |
| `AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED`        | Windows 禁止该设备被独占              | 到声音设备高级设置里启用独占控制                       |
| `AUDCLNT_E_UNSUPPORTED_FORMAT`                | 设备不接受当前 exclusive 格式         | 调整设备默认格式，或让 helper 使用 PCM fallback 后重试 |
| 第二条 exclusive stream 打开成功              | endpoint 没有被第一条 stream 真正锁住 | 这是需要修复的失败结果                                 |
| 非 Windows 跳过                               | 当前系统没有 WASAPI                   | 换 Windows 真机验证                                    |

## 人工交叉验证

自动探针通过后，再做一次真实播放路径检查：

1. 在 LUO Music 启用“原生音频输出”。
2. 模式选择“真独占模式”，设备选择要验证的同一个输出端点。
3. 播放本地音乐，确认运行详情显示 `WASAPI exclusive native file playback is running` 或同等含义。
4. 同时让 QQ 音乐、浏览器或系统测试音播放到同一个设备。

预期结果：其他软件不能在同一个输出端点正常混音播放。若其他软件仍有声音，先确认它没有切到另一个输出设备、虚拟声卡、蓝牙通道或显示器音频。

## bit-perfect candidate 验证

抢锁探针只能证明 endpoint 被 WASAPI exclusive 持有。若要进一步检查某个文件是否满足 bit-perfect 候选条件，可以设置本地音频文件路径后运行：

```powershell
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE = 'D:\Music\reference.flac'
npm run test:audio-output:bit-perfect
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE
```

可选环境变量：

```powershell
$env:LUO_AUDIO_OUTPUT_TEST_DEVICE_ID = '0:扬声器 (Realtek(R) Audio)'
$env:LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES = '512'
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_VOLUME = '1'
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE = '1'
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT = 'D:\Captures\candidate.json'
npm run test:audio-output:bit-perfect
Remove-Item Env:\LUO_AUDIO_OUTPUT_TEST_DEVICE_ID
Remove-Item Env:\LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_VOLUME
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT
```

这个脚本会：

1. 构建并启动 `audio-output-helper`。
2. 配置 WASAPI 真独占模式且关闭 shared fallback。
3. 运行真独占抢锁探针。
4. 播放 `LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE` 指向的本地文件。
5. 等待 `nativePlaybackSource` 等于本次文件、且播放状态进入 `starting` / `playing` / `paused` 的 `bitPerfect` 诊断，避免误读播放前的旧状态。
6. 输出包含 `exclusiveProbe`、`bitPerfect`、`proof`、`requiresExternalVerification` 和 `missingProof` 的 JSON 诊断。

脚本返回 `candidate` 只表示“WASAPI exclusive 锁有效、源格式与输出采样率 / 声道 / 样本格式兼容、原生音量为 100%”。当前 helper 只有在本地完整 PCM / IEEE-float WAV 可走 `WAV raw PCM passthrough`，或受支持 APE 可解码成 `APE decoded PCM raw passthrough`，且设备 exclusive 格式与源采样率、声道、位深和样本类型完全一致时，才可能进入 candidate；其他本地 / 在线可解码文件仍会经过 Symphonia streaming decoded-f32 管线，这不保留原始文件样本位，因此会被标记为 `notCandidate`。报告里的 `proof` 会保持为 `candidate-only`，`requiresExternalVerification` 会保持为 `true`，并通过 `audioFileIdentity` 记录源文件路径、字节数和 SHA-256，方便后续与 loopback 对比报告里的 `source.sha256` 对齐；设置 `LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT` 时会把同一份 candidate JSON 保存到指定路径。它仍然不是最终 bit-perfect 证明。

设置页里的“强制 bit-perfect 候选输出”是防降级保护：开启后，helper 只允许 WASAPI 真独占 raw PCM passthrough candidate 路径启动播放。shared 模式、Voicemeeter 路由、以及会落入 Symphonia decoded-f32 streaming 管线的格式都会被拒绝，而不是静默回退到共享或普通 native 播放；远程 Range 音频会先完整缓存，再交给 helper 做 candidate 判定。这个开关能保证“非候选不播放”，但不能替代 loopback / DAC 状态证明。验证脚本可通过 `LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE=1` 启用同一保护，并在报告里记录 `bitPerfectRequired: true`。

## loopback WAV 对比验证

如果已经通过 WASAPI loopback、声卡数字回录或外部录音工具拿到了同一次播放的录音 WAV，可以用采样级对比器把它和源 WAV 做进一步验证：

```powershell
npm run test:audio-output:loopback -- --source "D:\Music\source.wav" --capture "D:\Captures\loopback.wav"
```

如果录音前面存在设备延迟，可以允许脚本在 capture 前部搜索 offset：

```powershell
npm run test:audio-output:loopback -- --source "D:\Music\source.wav" --capture "D:\Captures\loopback.wav" --max-offset-frames 48000
```

如果已经把 `test:audio-output:bit-perfect` 的输出保存成 JSON，可以把 candidate 诊断和 loopback 对比合并成一份报告：

```powershell
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE = 'D:\Music\source.wav'
$env:LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT = 'D:\Captures\candidate.json'
npm run test:audio-output:bit-perfect
npm run test:audio-output:loopback -- --source "D:\Music\source.wav" --capture "D:\Captures\loopback.wav" --candidate "D:\Captures\candidate.json" --report "D:\Captures\candidate-plus-loopback.json"
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE
Remove-Item Env:\LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT
```

也可以设置 `LUO_AUDIO_OUTPUT_LOOPBACK_REPORT` 代替 `--report`，用于自动化脚本统一收集验证产物。

如果本轮 Windows 证据统一放在一个目录，可以先设置：

```powershell
$env:LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR = 'D:\Captures\luo-audio-output'
```

在没有显式 `--report` 或各脚本自己的 `*_REPORT` 环境变量时，remote refresh、Voicemeeter route、bit-perfect candidate、loopback 和 format matrix 脚本会分别写入 `remote-refresh.json`、`voicemeeter-route.json`、`candidate.json`、`candidate-plus-loopback.json`、`format-matrix-win32.json`。显式路径仍然优先，用于临时覆盖单项报告。

输出 JSON 中：

- `verdict: "verified"` 表示源 WAV 与 capture WAV 在对齐后所有比较样本都落在 `--tolerance` 范围内，且默认 capture 必须覆盖完整源音频帧范围，`proof` 为 `loopback-wav-comparison`。
- `proof: "candidate-plus-loopback"` 表示报告还合并了 bit-perfect candidate JSON；传入的 candidate 必须是 `verdict: "candidate"`、`proof: "candidate-only"`、`requiresExternalVerification: true`，并带有 `audioFileIdentity.sha256`。脚本会用 SHA-256 校验 candidate 的源文件身份是否和本次 `--source` 一致。
- `verdict: "not-verified"` 表示采样率 / 声道 / sample format / bit depth 不一致、无法对齐，或存在超过容忍度的样本差异。
- `source` / `capture` 会包含路径、字节数和 SHA-256，保存报告后可以复核参与比较的两个 WAV 文件是否被替换。
- `reportPath` 会在使用 `--report` 或 `LUO_AUDIO_OUTPUT_LOOPBACK_REPORT` 时写入报告，方便把保存位置和 stdout 输出对齐。
- 默认 `--tolerance 0` 且不允许 sample format / bit depth 转换，要求完全一致；如果录音工具只能写入 float WAV，可显式加 `--allow-format-conversion` 改为比较归一化样本值，但这会降低“bit-perfect”证明强度。显式传入 `--compare-frames` 时只代表子集对比，报告会标记 `partialComparison: true`，不应当当作完整曲目的 bit-perfect 证明。

## 证据包检查

当在线 URL 续签、Voicemeeter 路由、bit-perfect candidate、loopback 对比和格式矩阵都已经保存成 JSON 后，可以用证据包检查器做一次收尾复核：

```powershell
npm run check:audio-output:verification-bundle -- `
  --remote "D:\Captures\remote-refresh.json" `
  --voicemeeter "D:\Captures\voicemeeter-route.json" `
  --bit-perfect "D:\Captures\candidate.json" `
  --loopback "D:\Captures\candidate-plus-loopback.json" `
  --format "D:\Captures\format-matrix-win32.json" `
  --require-format-platform win32 `
  --report "D:\Captures\audio-output-verification-bundle.json"
```

如果所有报告都放在同一个 Windows 证据目录，也可以使用快捷入口：

```powershell
npm run check:audio-output:windows-proof -- --proof-dir "D:\Captures\luo-audio-output"
```

它会按标准文件名读取 `remote-refresh.json`、`voicemeeter-route.json`、`candidate.json`、`candidate-plus-loopback.json` 和 `format-matrix-win32.json`，自动要求 `win32` format report，并把最终 `audio-output-verification-bundle.json` 写回同一目录。

检查器只读取报告文件，不会播放声音或接触硬件。它默认要求：

- remote refresh 报告来自真实平台 URL（`mode: "live"`），且 `verdict: "refreshable"`；报告还必须证明过期 URL / headers 被 `401` 或 `403` 拒绝，fresh URL / headers 返回可缓存音频字节和音频型 content type。若报告使用 `proof: "remote-refresh-range"`，fresh 响应还必须是 `206` 并带有 `Content-Range`，避免把 HTML 登录页或 JSON 错误 payload 误当成在线 native 音频。最终报告还必须包含 `nativePlayback.started: true`，证明 fresh 音频已落盘并由 `audio-output-helper` 的 shared native 路径启动。
- Voicemeeter 报告为 `verdict: "routed-and-restored"`，并且 `routeApplied`、`routeManaged`、`routeRestored` 都为 `true`；请求的 `bus` 必须与实际 `routeBus` 一致，`remoteKind` 必须是 Standard / Banana / Potato 之一，报告必须包含被管理的 `virtualInputStrip`，并且 `levelActivityDetected: true` / `levelProbe` 必须证明测试音播放期间目标 bus 输出电平超过阈值；`restoreStatus.voicemeeterRemote.routeManaged` 必须为 `false`，证明 helper 停止后已释放 LUO Music 管理的路由。报告仍必须保留 `requiresManualAudibilityCheck: true`，并且最终证据必须记录 `manualAudibilityConfirmed: true`，表示人工确认测试音确实从目标 bus 听到。
- bit-perfect candidate 报告为 `verdict: "candidate"`、`proof: "candidate-only"`，保留 `requiresExternalVerification: true`，记录 `bitPerfectRequired: true`，并带有源文件 SHA-256。
- loopback 报告为 `proof: "candidate-plus-loopback"`、`verdict: "verified"`，且 loopback 报告中的 source / embedded candidate SHA-256 与单独传入的 bit-perfect candidate 报告一致；最终证明不能是 `partialComparison: true`，也不能使用 `allowFormatConversion: true`，必须覆盖完整源范围并保持 sample format / bit depth 不变。
- format matrix 报告为 `verdict: "samples-started"`，而不是只读取 manifest 的 `manifest-only`；默认至少 75% helper 声明支持的扩展名需要在 `samples` 明细里有成功启动样本，每个成功启动样本都必须带 `byteSize` 和 SHA-256，未覆盖格式会保留在 `missingSampleExtensions` 作为后续缺口。若要恢复全格式门槛，可在检查器上加 `--require-all-format-samples`，要求 `missingSampleExtensions` 为空。当前收尾只要求 Windows `win32` 报告声明 shared / exclusive / Voicemeeter。Linux / macOS format report 可作为后续扩展验证，但暂不作为本轮完成条件。

如果只是本地 dry-run，可以加 `--allow-mock-remote`、`--allow-format-manifest-only` 或 `--allow-partial-format-samples`，但这些开关不应作为最终“已完成”证明。`--min-format-sample-coverage` 可以提高或降低“大部分格式”的覆盖阈值，默认是 `0.75`；`--require-all-format-samples` 则用于未来 100% 全覆盖门槛。

## 这个测试不能证明什么

- 不能证明所有在线音源都一定进入原生 helper；它只证明 WASAPI exclusive 锁本身有效。
- 不能替代播放状态检查。播放歌曲时还要看状态里的 `activeMode` 是否为 `exclusive`。
- `test:audio-output:bit-perfect` 不能单独证明 bit-perfect。插件运行详情和 candidate 诊断只说明采样率、声道、样本格式和音量条件是否满足；WAV raw PCM passthrough 与 APE decoded PCM raw passthrough 仍需要 loopback / DAC 状态证明。decoded-f32 streaming 管线会被视为非候选，避免把内部解码后的 float 样本误当成原始文件位保真。
- `test:audio-output:loopback` 只能验证“给定 source WAV 与 capture WAV 是否一致”，不负责采集，也不能证明 capture 文件确实来自本次 LUO Music 独占播放。最终证明仍需要可靠的采集链路、DAC 状态或驱动 / DSP 链路确认。
- 不能覆盖所有驱动行为。部分虚拟音频设备、蓝牙设备和远程桌面设备可能不完全遵循普通 endpoint 的独占行为。

## 参考资料

- Microsoft: [Exclusive-Mode Streams](https://learn.microsoft.com/en-us/windows/win32/coreaudio/exclusive-mode-streams)
- Microsoft: [IAudioClient::Initialize](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-initialize)
