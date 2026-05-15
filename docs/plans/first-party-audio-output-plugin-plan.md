# 第一方音频输出插件方案

## 结论

三模式方向是可行的，但需要把“播放器输出管线”作为核心改造，而不只是给现有 `HTMLAudioElement` 外挂一个输出设备选择器。

推荐第一版做成 Windows Electron only 的第一方拓展插件，插件 ID 暂定 `builtin.audio-output`。它在插件管理页作为 `extension` 显示，但实现权限归宿主所有：renderer 只显示设置和状态，preload / IPC 传递控制命令，main 进程管理 native addon、设备枚举、音频会话和 Voicemeeter 控制。

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
| 共享   | miniaudio + WASAPI Shared                                    | 经 Windows audio engine          | 可同时有声                       | 中等到低 | 默认用户、兼容优先             |

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

| 路线                                                                     | 优点                                                  | 风险                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------- |
| Renderer 解码 / capture → AudioWorklet → SharedArrayBuffer → main/native | 能复用浏览器解码能力，对远程格式兼容最好              | 跨进程同步复杂，需要处理 SAB 安全配置、时钟、背压和可视化关系 |
| Main/native 解码 URL / 文件 → miniaudio                                  | 数据路径清晰，适合本地文件和可直接下载的 MP3/FLAC/WAV | 需要补齐 AAC/M4A/OGG/APE 等格式，远程鉴权和 Range 请求更复杂  |
| 只对本地音乐库先启用 native 输出                                         | 范围小，最容易验证独占/共享/设备切换                  | 在线歌曲仍走旧播放器，用户会感知能力不一致                    |

推荐顺序：

1. Phase 0 先做本地 WAV/FLAC/MP3 原型，验证 miniaudio device、ring buffer、WASAPI shared/exclusive。
2. Phase 1 只把“本地音乐库 + 可直接解码格式”纳入第一版插件。
3. Phase 2 再决定是否让在线音源进入 native 管线，或继续由 Chromium 播放。

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
    ○ 类独占模式

  输出设备
    [设备下拉]

  当前输出
    模式：WASAPI Shared / WASAPI Exclusive / Voicemeeter
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

- 建立最小 N-API addon。
- 引入 miniaudio，固定 WASAPI backend。
- 枚举设备，输出测试音。
- 验证 shared/exclusive 初始化、失败码、设备断开事件。
- 验证 native addon 打包、asar unpack、签名和 Electron runtime 加载。

成功标准：

- `npm run dev:electron` 能加载 addon。
- shared 输出测试音。
- exclusive 成功时同一设备被占用。
- exclusive 失败时能返回结构化错误。

### Phase 1：共享模式插件

- 新增 `builtin.audio-output` 第一方插件描述。
- 新增 AudioOutputService、IPC 和设置页。
- 支持共享模式设备选择。
- 只接入本地可直接解码音源，保留现有 `PlayerCore` fallback。
- 增加诊断日志和用户可见状态。

### Phase 2：真独占模式

- 增加格式协商和 fallback policy。
- 显示实际输出格式。
- 增加 underrun、deviceLost、formatRejected 事件。
- 增加本地音乐库测试音源和人工 QA 流程。

### Phase 3：Voicemeeter 模式

- 检测 Voicemeeter 安装和运行状态。
- 优先用 Remote API DLL 控制路由。
- 如保留 VBAN-TEXT，补 VBAN packet 构造、stream name 配置和防火墙提示。
- UI 增加 Voicemeeter 状态和路由选择。

### Phase 4：扩大音源覆盖

- 评估在线歌曲是否进入 native 输出管线。
- 决定使用 Chromium 解码桥、native 解码器，或保持双管线。
- 增加格式兼容矩阵和回归测试。

## 测试计划

自动化测试：

- native addon 加载失败 fallback。
- 设备枚举数据结构。
- shared / exclusive init 参数校验。
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

| 风险                                | 处理方式                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 解码管线复杂度高                    | 先限制到本地可直接解码格式，不把在线音源纳入首版。                                                    |
| native addon 打包和签名增加维护成本 | Phase 0 必须验证 Electron 打包链路，再进入功能实现。                                                  |
| bit-perfect 难以证明                | UI 使用“独占模式 / bit-perfect 目标”，用设备状态和 loopback 测试建立验证流程。                        |
| Voicemeeter 用户环境差异大          | 默认不自动改动用户复杂配置，提供检测、预览和一键恢复。                                                |
| 双播放管线造成状态不一致            | AudioOutputService 必须成为播放器状态唯一输出协调者，不能让 `HTMLAudioElement` 和 native 同时抢输出。 |
| 第三方插件安全边界                  | 不向 external plugin 暴露 native audio 权限。                                                         |

## 资料依据

- [miniaudio Programming Manual](https://miniaud.io/docs/manual/)：确认 Windows backend、shared/exclusive 能力、WASAPI 低延迟 shared mode 注意事项。
- [Microsoft WASAPI Exclusive-Mode Streams](https://learn.microsoft.com/en-us/windows/win32/coreaudio/exclusive-mode-streams)：确认独占模式语义和设备占用边界。
- [Microsoft IAudioClient3 InitializeSharedAudioStream](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-initializesharedaudiostream)：确认 Windows 低延迟 shared stream 能力。
- [Node-API 文档](https://nodejs.org/api/n-api.html)：确认 Node-API ABI 稳定范围和限制。
- [Electron Native Code and Electron](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron)：确认 Electron native addon 接入方式。
- [Voicemeeter Remote API 文档](https://download.vb-audio.com/Download_CABLE/VoicemeeterRemoteAPI.pdf)：确认本机控制 API、安装 / 运行前提和参数模型。
- [VBAN Protocol Specifications](https://vb-audio.com/Voicemeeter/VBANProtocol_Specifications.pdf)：确认 VBAN-TEXT 是带 header 的 UDP packet，不是裸字符串命令。
