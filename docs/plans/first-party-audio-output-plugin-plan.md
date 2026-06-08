# 第一方音频输出插件方案

## 结论

三模式方向是可行的，但需要把“播放器输出管线”作为核心改造，而不只是给现有 `HTMLAudioElement` 外挂一个输出设备选择器。

推荐第一版做成 Windows 桌面端 Electron 第一方拓展插件，插件 ID 暂定 `builtin.audio-output`。它在插件管理页作为 `extension` 显示，但实现权限归宿主所有：renderer 只显示设置和状态，preload / IPC 传递控制命令，main 进程管理 native addon、设备枚举、音频会话和 Voicemeeter 控制。shared 输出当前复用 CPAL 作为实现基线，但本轮验收只要求 Windows；WASAPI Exclusive 和 Voicemeeter Remote API 也仍然是 Windows-only 能力。

## 当前分支实现边界

当前 `feature/native-audio-output-plugin` 分支先落地插件管理、IPC 协议、Electron main service、构建打包入口、Rust helper 原型，以及第一条真实播放链路。这个阶段的目标是让用户能在插件页启用音频输出插件、选择模式、选择设备，并在 Windows Electron 下让本地可解码音频文件进入 Rust helper 播放；非 Windows helper 侧只保留 CPAL shared 原型和分发脚本基础验证，macOS / Linux 真实打包运行、设备权限和硬件验证都不作为本轮完成条件。

已实现范围：

- `builtin.audio-output` 第一方插件描述、开关和设置项。
- renderer 侧设置持久化、IPC 桥接和状态订阅。
- main 进程 `AudioOutputService` 启动 Rust helper，并同步 `initialize` / `configure` / `status` / `playback` 事件。
- Rust `audio-output-helper` 通过 `cpal` 枚举桌面输出设备，并返回 shared / exclusive / Voicemeeter 的诚实状态；shared 模式的设备枚举、测试音、静音保持和可解码文件播放走 CPAL shared output。Windows 下 Voicemeeter 输出设备会按名称识别为虚拟输入路由，并通过 Voicemeeter Remote API DLL 做最小路由接入。
- 插件卡片提供“测试输出”动作，可通过 Rust helper 在当前原生设备上播放短测试音：shared 模式走 CPAL shared stream，exclusive 模式会尝试 WASAPI Exclusive 初始化并播放测试音，失败时按用户配置回退 shared 或返回 unavailable。
- 播放器在 Electron + 本地音乐库可解码音频文件场景下，会优先调用 Rust helper 播放真实歌曲；支持开始、暂停、恢复、停止、音量同步、播放结束事件，以及 native 失败后回退 Chromium 播放。
- 在线歌曲拿到直接 HTTP(S) 播放 URL 后，main 进程会把远程媒体受限下载到用户数据目录下的 native audio cache，再复用 Rust helper 的本地文件播放链路。这让在线歌曲可以进入 shared / exclusive native 输出的第一条原型路径；下载会随停止播放、停用插件、发起新播放或退出时取消，并清理半成品缓存，插件运行详情会显示在线缓存进度、服务端 Range 支持状态和当前缓存策略。若上游支持 `206 Content-Range` 且能提供总长度，main 会在首个有限 Range chunk 落盘后立即启动 helper，并继续后台补齐缓存；helper 通过 growing local file source 等待后续字节。`.ape` 是例外：APE decoder 需要完整本地 cache，main 会补齐所有 range 后再启动 helper。插件返回的 `StandardSongUrl.headers` 会随播放 URL 缓存到当前歌曲的 native 请求头快照，renderer 只传递显式 headers，main 进程按 allowlist 合并 `Accept` / `Accept-Language` / `Authorization` / `Cookie` / `Origin` / `Referer` / `User-Agent`，并始终由 main 自己生成 `Range`。单响应、未知总长度或需要尾部 metadata 的格式仍可能等待更多缓存完成。
- renderer 会对 URL pathname 明确以 `.mkv` 结尾的在线歌曲提前保留 Chromium 播放，避免明显 unsupported 的远程格式先进入 native cache 再失败；`.opus` / `.webm` 只有在 helper 状态明确报告 `supportedExtensions` 包含对应扩展名时才会进入 native；无扩展名或不确定格式仍会按直接 HTTP(S) 路径尝试 native。
- Rust helper 通过 Symphonia 解码本地 `.wav` / `.aif` / `.aiff` / `.caf` / `.flac` / `.mp1` / `.mp2` / `.m2a` / `.mp3` / `.mpa` / `.aac` / `.m4a` / `.ogg` / `.oga`，以及 Matroska 音频容器（例如 `.mka`，实际仍取决于内部 codec）；`.ape` 通过 `ape-decoder` 解码常见 WAV-sourced PCM Monkey's Audio 文件。其中 `.m4a` 可覆盖 AAC / ALAC 的 MP4 路线，`.ogg` / `.oga` 当前按 Vorbis 路线支持。shared 播放链路走 CPAL shared output；Windows exclusive 播放链路走直接 WASAPI Exclusive；两条链路都会按设备默认格式做基础声道映射和采样率步进。
- 具体格式边界见 [原生音频输出格式支持](../native-audio-output-format-support.md)；本地路由按扩展名白名单进入 native，在线路由会尝试缓存后交给 helper，实际仍以解码结果为准。
- 原生设备选择当前仍使用 CPAL 枚举出的 `index:name` ID。exclusive 路径会先验证同 index 的 WASAPI FriendlyName，若枚举顺序不一致则按设备名回退搜索，避免把真独占锁到另一个输出端点。
- WASAPI Exclusive 初始化前会先探测格式支持；若设备不接受 shared mix format（例如部分 Realtek 端点不接受 32-bit float exclusive），helper 会尝试 24/16/32-bit PCM fallback，再报告实际输出格式。
- 播放状态会带出 bit-perfect 候选诊断：源格式、实际输出格式、原生音量和候选/非候选/未验证原因。项目提供 `npm run test:audio-output:bit-perfect` 作为 Windows 手动验证入口，会组合 WASAPI exclusive 抢锁探针和真实文件播放诊断。候选只表示 WASAPI exclusive、采样率 / 声道 / 样本格式兼容且音量为 100%，仍不等于已经完成 loopback 或 DAC 级证明；当前本地完整 PCM / IEEE-float WAV 在源格式与 WASAPI exclusive 输出格式完全一致时可走 `WAV raw PCM passthrough`，受支持 APE 可解码成 `APE decoded PCM raw passthrough` 候选，其他本地 / 在线可解码文件仍经过 Symphonia streaming decoded-f32 管线并会被标为非候选，避免把内部解码后的 float 样本误当成原始文件位保真。若用户已采集到 loopback / 外部录音 WAV，可用 `npm run test:audio-output:loopback -- --source ... --capture ...` 做采样级对比报告。
- Rust helper 内已有 `StreamingPcmBuffer` 基础队列、`StreamingPcmRenderState` 输出适配层，以及 shared CPAL 的 `build_streaming_file_stream` 构建函数；当前 runtime 的 shared / Voicemeeter / WASAPI exclusive 文件播放都已切到“后台 Symphonia producer 持续写入、输出端非阻塞读取”的 streaming PCM 路径，并会在 `startSeconds` 起播时优先尝试容器 seek，失败再顺序丢弃样本。exclusive 仍保留直接 WASAPI 初始化、格式探测和 endpoint 抢占语义。
- `AudioOutputStatus.supportedModes` 会把当前平台可用模式结构化返回给 renderer：Windows 暴露 shared / exclusive / Voicemeeter，非 Windows 只暴露 shared。设置 schema 会按这个字段隐藏不可用模式；若用户配置里保留了当前平台不可用的历史模式，会保留该选项并标记“当前平台不可用”，避免静默改写用户设置。
- Electron 开发、构建和打包脚本会生成并复制当前平台的 `audio-output-helper` 二进制；Windows 文件名为 `audio-output-helper.exe`，macOS / Linux 文件名为 `audio-output-helper`。

仍未实现范围：

- Symphonia / APE decoder 当前不能解码的本地或在线文件仍走 renderer 中的 `HTMLAudioElement` 和 Chromium 播放链路；WebM 内如果是 Opus 音频轨道，只有 helper 用 Opus feature 编译并报告 `.webm` 能力后才可能进入 native。
- `.opus` / `.webm` 已接入 opt-in 候选路线：`LUO_AUDIO_OUTPUT_HELPER_FEATURES=opus` 使用系统 libopus，`opus-bundled` 使用 bundled libopus 且需要 CMake。当前本机 `opus` 路线只通过 `cargo check`，链接测试仍缺少可链接的 `opus.lib`；`opus-bundled` 路线缺少 CMake。CI/跨平台构建、包体预算和真实样本验证尚未完成，因此暂不作为默认 helper 依赖。`.ape` 已接入默认 helper，但仍需要覆盖压缩级别、位深、声道和 post-processing 变体的真实样本验证。
- 当前在线 native 播放只覆盖可直接 GET/Range 下载的 HTTP(S) 音频 URL；已具备有限 Range chunk 缓存、首块可播放后后台补齐、下载取消、半成品缓存清理、旧请求防护，以及插件显式鉴权 headers 透传。main 进程缓存阶段遇到 `401` / `403` 会标记为可重试的远程授权过期错误，renderer 会清掉旧 URL / headers / 预取缓存并重新走 `getSongUrl()` 刷新播放地址；若错误发生在播放中，刷新成功后会回到失败前的播放进度。helper 直接消费 HTTP 流、Chromium 解码桥，以及真实 Netease / QQ 在线 URL 续签验证仍未完成。
- helper 当前的 shared / Voicemeeter / WASAPI exclusive 文件播放已经由后台 Symphonia / APE producer 写入 `StreamingPcmBuffer`；在线歌曲在 Range + 总长度可用时会通过 growing local cache file 进入同一条 streaming PCM 路径，但 `.ape` 会先完整缓存。MP4/M4A 等需要 seek 到尾部 metadata 的容器可能仍要等待相关字节下载完成，不能承诺所有格式都能首块秒开。
- 非 Windows 目前只代表 helper 侧 shared CPAL 能力和 Electron helper 分发路径已有基础自动化覆盖；macOS / Linux 的真实打包运行、设备权限、真实硬件验证和 UI 文案适配尚未收尾。
- `cpal` 0.16 的 WASAPI backend 当前只负责 shared stream；exclusive 测试音和本地可解码文件播放使用 helper 内的直接 WASAPI 调用。
- 选择独占模式时，插件启用后会先显示“等待真独占测试/播放”。本地可解码文件或测试音会真正尝试进入 WASAPI Exclusive。若设备或格式初始化失败，并且用户开启了自动回退，会回到 shared 播放；其他音源仍不应在 UI 或文档中表述为已支持真独占播放。
- bit-perfect 目前是本地 PCM / IEEE-float WAV raw passthrough、APE decoded PCM raw passthrough 候选路径、候选诊断、手动 candidate 验证脚本、capture WAV 对比器，以及“强制 bit-perfect 候选输出”的防降级开关。开启该开关时，远程 Range 音频会先完整缓存，helper 会拒绝 shared / Voicemeeter / decoded-f32 非候选路径，不会静默回退；但这仍不是最终保证。helper 当前仍会把 decoded-f32 streaming 管线标成非候选；还没有做自动 loopback 采集、DAC 状态读取、原始压缩音源位深保真证明或 DSP/驱动链路端到端校验。
- Voicemeeter 模式目前可把测试音和可解码文件输出到 VoiceMeeter 虚拟输入设备；Windows 下会动态加载 `VoicemeeterRemote64.dll` / `VoicemeeterRemote.dll`，登录 Remote API，并按 VoiceMeeter / Banana / Potato 的 virtual input strip 打开用户选择的 `A1/A2/A3/B1/B2/B3` bus。helper 会在写入该 bus 前记录旧值，并在配置切换、停用或进程退出时恢复 LUO Music 管理过的单个路由；测试音验证会额外采样 `VBVMR_GetLevel` 输出电平，证明播放期间目标 bus 看到信号活动。尚未提供复杂路由 diff、自动关闭其他用户路由或 VBAN-TEXT 控制。

因此，这条分支应被视为“第一方插件壳层 + Rust helper 原型 + 设备/状态协议 + 本地可解码文件 shared / Voicemeeter / exclusive streaming PCM 播放 + 在线 URL Range/growing-cache native 播放原型”的实现，不是完整 native 播放输出管线。后续要真正让用户选择共享或独占播放所有歌曲，还需要补真实平台在线续签验证、helper 直连远程流或 Chromium 解码桥，以及更完整的格式协商 / 设备恢复能力。

## 需要修正的点

| 原设想                                   | 修正建议                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| miniaudio + WASAPI Exclusive / 可选 ASIO | miniaudio 官方 Windows 后端覆盖 WASAPI、DirectSound、WinMM，不把 ASIO 放入首版。ASIO 如需支持，应单独做后续 spike，或通过 Voicemeeter / 专业声卡软件桥接。                                    |
| N-API 后就无需关心 ABI                   | Node-API 能降低 Node / Electron ABI 变化带来的重编译压力，但 native addon 仍需要按 OS / arch 构建、签名、打包到 unpacked 目录，并约束只使用 Node-API。                                        |
| WASAPI Exclusive 等于 bit-perfect        | 独占模式只是绕过 Windows shared mixer。真正 bit-perfect 还要求采样率、位深、声道、音量、DSP、重采样和格式转换全部可控。文案建议写成“bit-perfect 目标模式”，实现后用 loopback / DAC 状态验证。 |
| VBAN-TEXT UDP 直接发送 `Strip[2].A1=1`   | VBAN-TEXT 需要 VBAN packet header、stream name 和 Voicemeeter incoming stream 配置。对本机控制，优先评估 Voicemeeter Remote API DLL；VBAN-TEXT 更适合远程或无 DLL 调用场景。                  |
| SharedArrayBuffer + Worker 直接送主进程  | 可作为目标管线，但必须先解决解码来源、背压、丢帧、跨进程同步和 Electron 安全配置。不要用普通 IPC 逐块传 PCM。                                                                                 |

## 模式总览

| 模式   | 技术核心                                                     | 音质目标                         | 其他应用                         | 延迟目标 | 适合用户                       |
| ------ | ------------------------------------------------------------ | -------------------------------- | -------------------------------- | -------- | ------------------------------ |
| 真独占 | miniaudio + WASAPI Exclusive                                 | bit-perfect 目标，需格式匹配验证 | 同一输出设备上的其他应用不可播放 | 最低     | 发烧友、外接 DAC 用户          |
| 类独占 | WASAPI Shared 输出到 Voicemeeter VAIO，再由 Voicemeeter 路由 | 经 Voicemeeter 混音 / 缓冲       | 可同时有声                       | 低       | 多任务、直播、同时听系统声用户 |
| 共享   | CPAL Shared（Windows 下走 WASAPI Shared 后端）               | 经系统 shared audio engine       | 可同时有声                       | 中等到低 | 默认用户、兼容优先             |

延迟只作为目标区间，不在 UI 中承诺固定毫秒数。实际延迟由设备驱动、buffer size、音源解码、网络、系统负载和 Voicemeeter 配置共同决定。

## 推荐架构

```text
Renderer
  播放 UI / 音频设置 / 插件管理
      |
      | preload IPC
      v
Electron Main
  FirstPartyAudioOutputService
    - mode state
    - device state
    - fallback policy
    - Voicemeeter controller
      |
      | N-API / node-addon-api
      v
Native Audio Addon
  miniaudio device layer
    - enumerate devices
    - shared / exclusive init
    - ring buffer consume
    - underrun / device lost events
      |
      v
WASAPI / Voicemeeter / Physical device
```

第一方插件只暴露管理面：

- `builtin.audio-output` 显示在插件管理页「拓展」分类。
- 插件开关控制宿主音频输出服务是否接管播放。
- 插件设置页提供输出模式、设备、buffer、fallback 策略和诊断信息。
- 第三方插件 SDK 不开放 native audio 权限。

## 音频数据管线

这是方案里最大的工程风险，需要先做 Phase 0 spike。

当前 LUO Music 播放核心在 renderer 使用 `HTMLAudioElement`。如果切到 miniaudio 输出，就必须把“可播放 URL”转成 native addon 可消费的 PCM。可选路线：

| 路线                                                                     | 优点                                             | 风险                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| Renderer 解码 / capture → AudioWorklet → SharedArrayBuffer → main/native | 能复用浏览器解码能力，对远程格式兼容最好         | 跨进程同步复杂，需要处理 SAB 安全配置、时钟、背压和可视化关系 |
| Main/native 解码 URL / 文件 → miniaudio                                  | 数据路径清晰，适合本地文件和可直接下载的常见格式 | 需要补齐 APE/Opus 等格式，远程鉴权和 Range 请求更复杂         |
| 只对本地音乐库先启用 native 输出                                         | 范围小，最容易验证独占/共享/设备切换             | 在线歌曲能力不一致，需要后续补远程缓存或流式管线              |

推荐顺序：

1. Phase 0 先做设备枚举、测试音、本地 WAV 原型，验证 Rust helper、CPAL shared output、WASAPI exclusive 播放和打包链路。
2. Phase 1 只把“本地音乐库 + 可直接解码格式”纳入第一版插件；当前分支已扩展到 Symphonia 可解码的本地常见格式。
3. Phase 2 先让可直接下载的在线音源通过 main 进程 Range/growing-cache 进入 native 管线，并保证下载可取消、缓存可清理，再评估是否升级到 helper 直连远程流或 Chromium 解码桥。

## Native Addon 接口

TypeScript 侧建议先收敛成最小接口：

```ts
export type NativeAudioMode = 'shared' | 'exclusive'

export interface NativeAudioDevice {
  id: string
  name: string
  isDefault: boolean
  backend: 'wasapi'
  supportedFormats?: NativeAudioFormat[]
}

export interface NativeAudioFormat {
  sampleRate: number
  channels: number
  format: 'f32' | 's16' | 's24' | 's32'
}

export interface NativeAudioInitOptions {
  deviceId: string
  mode: NativeAudioMode
  sampleRate: number
  channels: number
  format: NativeAudioFormat['format']
  bufferFrames: number
}

export interface NativeAudio {
  enumerateDevices(): Promise<NativeAudioDevice[]>
  init(options: NativeAudioInitOptions): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  close(): Promise<void>
  getState(): Promise<NativeAudioRuntimeState>
}
```

PCM 写入不要设计成频繁 `write(ArrayBuffer)` IPC。真正实现时应使用 native 层可消费的 ring buffer，JS 侧只负责填充或通知。

## Rust / TypeScript 分工

建议采用“TypeScript 管理壳层，Rust 实现原生后端”的路线，而不是只用 TypeScript 实现音频输出。

TypeScript / Electron 侧负责：

- 第一方插件 `builtin.audio-output` 的开关、设置页、状态展示和错误提示。
- preload / IPC / main process 的控制命令转发。
- 配置持久化、fallback 策略、诊断信息展示。
- 与现有播放器状态、插件管理页、窗口生命周期保持一致。

Rust 侧负责：

- 设备枚举、WASAPI Shared / Exclusive 初始化和关闭。
- 输出格式协商、buffer 管理、低延迟调度和 underrun 诊断。
- 设备断开、格式不匹配、独占失败等结构化错误。
- 测试音输出、后续 PCM ring buffer 消费和真实播放管线。

只用 TypeScript 基本只能复用 Chromium 的 `HTMLAudioElement` / WebAudio / `setSinkId` 能力，适合做普通输出设备选择，但无法真正覆盖 WASAPI Exclusive、bit-perfect 目标模式、低延迟 native buffer 和平台级设备事件。因此，TypeScript 不应承担原生音频后端职责。

本项目已经有 Rust SMTC helper 的接入经验，音频输出可以延续类似方向：先用 TS 完成插件管理和 IPC 合同，再新增 Rust `audio-output-helper` 或 native addon 完成实际输出能力。真正进入 PCM 播放管线后，需要评估 helper 进程、N-API addon、shared memory / ring buffer 等方案的实时性和打包成本。

### 直接结论

- 原生音频输出后端优先用 Rust，不建议只靠 TypeScript 实现。
- TypeScript 只负责插件壳层、设置页、IPC、状态展示和配置持久化。
- Rust 可以承担跨端共享核心，但 Android 和 iOS 仍然需要各自的原生音频后端。
- 如果后续要做移动端原生输出，推荐保持 `Rust shared core + 平台 backend` 的结构，而不是把平台差异都塞进一份通用实现里。

## 跨端可行性

Rust 可以作为 Android / iOS / Windows 共用的音频核心，但平台音频驱动层不能完全复用同一份实现。推荐把跨端边界设计为“共享 Rust core + 平台 backend”：

直接结论：Rust 适合做跨端原生音频的公共核心，但不能指望一份实现同时覆盖 Android 和 iOS 的全部系统音频接入细节。移动端仍然需要各自的原生后端，分别对接 Android 的 AAudio / Oboe / OpenSL ES，以及 iOS 的 CoreAudio / AudioUnit / AVAudioEngine。

```text
Rust shared core
  - AudioOutputService
  - ring buffer
  - format negotiation
  - diagnostics
  - backend trait

Platform backend
  - Desktop shared: CPAL
  - Windows exclusive: WASAPI
  - Android: AAudio / Oboe / OpenSL ES
  - iOS: CoreAudio / AudioUnit / AVAudioEngine
```

可复用的部分：

- 状态机、错误模型、配置 schema、诊断事件。
- buffer / ring buffer、格式转换、测试音和后续 DSP。
- 播放控制协议与上层应用的状态同步约定。

需要分平台实现的部分：

- 桌面 shared：CPAL 设备枚举、默认输出格式、测试音和可解码文件播放。
- Windows：WASAPI Exclusive、Voicemeeter Remote API、设备占用探测和 session 管理。
- Android：通过 NDK / JNI / Oboe 或 AAudio 接入系统音频。
- iOS：通过 C ABI / Swift / Objective-C 接 CoreAudio、AudioUnit 或 AVAudioEngine，并处理 `AVAudioSession`。

因此当前分支应优先保证 Windows Rust 后端的完整度，同时把 shared CPAL 路径保持为后续可复用的实现基线，但不把 macOS / Linux 支持纳入本轮收尾门槛。后续如果出现 Android / iOS 客户端，再在同一套 core 之下补移动端 backend。

## 真独占模式

### 目标

- 使用 WASAPI Exclusive 初始化指定输出设备。
- 尽量使用音源原始采样率、声道数和位深。
- 禁止不必要 DSP、系统混音和系统采样率转换。
- 失败时可自动回退到共享模式，并在 UI 明确提示。

### 关键规则

- 独占初始化失败不是异常崩溃，而是普通能力不匹配。
- 独占模式只影响被占用的同一输出设备，不应表述为“全系统所有声音静音”。
- 设备断开时暂停 native 输出，回退策略由用户配置决定。
- UI 要显示当前实际输出格式，而不是只显示音源格式。

### 首版限制

- 不支持 ASIO。
- 不承诺所有声卡都可 bit-perfect。
- 不支持自动跟随 Windows 默认设备切换；只监听设备丢失并提示重新选择。

## 类独占模式

### 推荐控制方式

优先评估 Voicemeeter Remote API DLL：

- 本机控制更直接。
- 可读取 Voicemeeter 类型、状态和参数。
- 不要求用户手动配置 VBAN incoming stream。

VBAN-TEXT UDP 可作为第二路线：

- 需要构造 VBAN packet header，不是裸发命令字符串。
- 需要用户在 Voicemeeter 中开启 VBAN，并配置 incoming text/remoting stream。
- 需要处理防火墙、端口、stream name 和网络暴露风险。

### 输出路径

```text
LUO Music native/shared output
    -> Voicemeeter Input VAIO
    -> Voicemeeter bus A1/A2/A3
    -> physical device
```

这不是 bit-perfect 模式。它的价值是让 LUO Music 避开 Windows 默认输出设备竞争，同时保留其他应用声音和灵活路由。

### 分发策略

首版不捆绑 Voicemeeter 驱动或安装包，只做检测和引导。后续如果要随应用分发，必须单独确认 VB-Audio 授权和安装器体验。

## 共享模式

共享模式是默认保底：

- 使用 WASAPI Shared。
- 兼容多应用同时播放。
- 系统音量、设备默认格式和 Windows audio engine 继续生效。
- 低延迟共享模式只作为优化目标；当应用采样率不同于设备 native sample rate 时，低延迟路径可能不可用。

共享模式也是独占失败后的默认 fallback。

## 设置界面

建议不要把“发烧友术语”堆给所有用户。默认只显示模式和设备，高级项折叠。

```text
音频输出
  模式
    ○ 共享模式
    ○ 真独占模式
    ○ 类独占模式（Voicemeeter）

  原生输出设备
    [设备下拉]
    用于本地可解码文件走 Rust helper 的 shared / exclusive 播放链路。

  Chromium / 回退输出设备
    [设备下拉]
    用于在线音源、不支持 native 解码的音源，以及 native 播放失败后回退到 HTMLAudioElement 的输出设备。

  当前输出
    请求模式：共享模式 / 真独占模式 / 类独占模式
    实际原生模式：WASAPI Shared / WASAPI Exclusive / Voicemeeter / 不可用
    原生设备：系统默认 / 设备名
    Chromium / 回退设备：系统默认 / 设备名
    格式：44100 Hz / 2ch / f32
    延迟：buffer 估算值

  高级
    Buffer frames
    独占失败时自动回退共享模式
    启用诊断日志
```

提示文案：

| 场景               | 文案                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| 切换真独占         | 开启后，其他应用可能无法使用同一输出设备。需要同时听系统声音时，请使用共享模式或 Voicemeeter 模式。  |
| 独占格式不匹配     | 当前设备不接受这个输出格式，已回退到共享模式。可以更换设备、调整音源格式，或关闭自动回退后手动重试。 |
| Voicemeeter 未安装 | 类独占模式需要安装并运行 Voicemeeter。安装后重启 LUO Music 或重新检测。                              |
| VBAN 未配置        | 未检测到可用 VBAN incoming stream。请开启 Voicemeeter VBAN，并配置 text/remoting stream。            |

## 实现路线

### Phase 0：技术验证

- 建立 Rust `audio-output-helper`。
- 通过 CPAL 枚举设备，输出 shared 测试音。
- 通过直接 WASAPI 调用验证 exclusive 初始化和测试音。
- 验证本地可解码文件可进入 shared 和 exclusive native 播放链路。
- 验证 helper 打包、asar unpack、签名和 Electron runtime 加载。

成功标准：

- `npm run dev:electron` 能加载 helper。
- shared 输出测试音。
- exclusive 成功时同一设备被占用。
- exclusive 失败时能返回结构化错误。
- 本地可解码文件播放可走 native helper，shared / exclusive 均能返回播放状态，失败时回退 Chromium。

### Phase 1：共享模式插件

- 新增 `builtin.audio-output` 第一方插件描述。
- 新增 AudioOutputService、IPC 和设置页。
- 支持共享模式设备选择。
- 只接入本地可解码音源，保留现有 `PlayerCore` fallback。
- 增加诊断日志和用户可见状态。

### Phase 2：真独占模式

- 扩展格式协商和 fallback policy。
- 显示实际输出格式。
- 增加 underrun、deviceLost、formatRejected 事件。
- 增加本地音乐库人工 QA 流程和更多采样率 / 声道组合。

### Phase 3：Voicemeeter 模式

- 检测 Voicemeeter 虚拟输入设备，并允许测试音 / 可解码文件输出到该设备。
- 动态加载 Voicemeeter Remote API DLL，登录后按当前 virtual input strip 打开用户选择的 `A1/A2/A3/B1/B2/B3` bus；当前分支已完成最小路由接入、用户可选 bus、测试音播放期 Remote API 输出电平采样，以及 LUO Music 管理路由的快照恢复。
- 后续补复杂路由 diff、Voicemeeter 未运行时的一键启动和更完整的错误恢复；不自动清空用户在 VoiceMeeter 中配置的其他路由。
- 如保留 VBAN-TEXT，补 VBAN packet 构造、stream name 配置和防火墙提示。
- UI 增加 Voicemeeter 状态和路由选择。

### Phase 4：扩大音源覆盖

- 将在线歌曲从 main 进程 Range/growing-cache 边下边播升级为真实平台验证过的 URL 过期续签、helper 直连远程流或 Chromium 解码桥。
- 决定使用 Chromium 解码桥、native 解码器，或保持双管线。
- 增加格式兼容矩阵和回归测试。

## 测试计划

自动化测试：

- native addon 加载失败 fallback。
- 设备枚举数据结构。
- shared / exclusive init 参数校验。
- 本地可解码文件 play / pause / resume / stop / volume IPC 参数校验。
- 播放器只在 Electron + 本地可解码文件时启用 native，其他音源保留 Chromium。
- 独占失败错误码映射。
- Voicemeeter 未安装状态。
- 插件开关持久化和 Electron only 显示。
- IPC 参数 schema 校验。

手动 QA：

- Windows 10 / 11。
- 内置声卡、USB DAC、蓝牙耳机。
- 44.1 / 48 / 96 kHz 音源。
- shared 播放时其他应用仍有声。
- exclusive 播放时同一设备被占用。
- 设备拔出、默认设备切换、睡眠恢复。
- Voicemeeter Standard / Banana / Potato 安装状态。

## 风险清单

| 风险                                | 处理方式                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 解码管线复杂度高                    | 先限制到本地和可直接下载的在线可解码格式；在线歌曲优先走 Range/growing-cache，未知长度或不适合流式探测的格式继续完整缓存。 |
| native addon 打包和签名增加维护成本 | Phase 0 必须验证 Electron 打包链路，再进入功能实现。                                                                       |
| bit-perfect 难以证明                | UI 使用“独占模式 / bit-perfect 目标”，用设备状态和 loopback 测试建立验证流程。                                             |
| Voicemeeter 用户环境差异大          | 默认不自动改动用户复杂配置，提供检测、预览和一键恢复。                                                                     |
| 双播放管线造成状态不一致            | AudioOutputService 必须成为播放器状态唯一输出协调者，不能让 `HTMLAudioElement` 和 native 同时抢输出。                      |
| 第三方插件安全边界                  | 不向 external plugin 暴露 native audio 权限。                                                                              |

## 资料依据

- [miniaudio Programming Manual](https://miniaud.io/docs/manual/)：确认 Windows backend、shared/exclusive 能力、WASAPI 低延迟 shared mode 注意事项。
- [Microsoft WASAPI Exclusive-Mode Streams](https://learn.microsoft.com/en-us/windows/win32/coreaudio/exclusive-mode-streams)：确认独占模式语义和设备占用边界。
- [Microsoft IAudioClient3 InitializeSharedAudioStream](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-initializesharedaudiostream)：确认 Windows 低延迟 shared stream 能力。
- [Node-API 文档](https://nodejs.org/api/n-api.html)：确认 Node-API ABI 稳定范围和限制。
- [Electron Native Code and Electron](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron)：确认 Electron native addon 接入方式。
- [Voicemeeter Remote API 文档](https://download.vb-audio.com/Download_CABLE/VoicemeeterRemoteAPI.pdf)：确认本机控制 API、安装 / 运行前提和参数模型。
- [VBAN Protocol Specifications](https://vb-audio.com/Voicemeeter/VBANProtocol_Specifications.pdf)：确认 VBAN-TEXT 是带 header 的 UDP packet，不是裸字符串命令。
