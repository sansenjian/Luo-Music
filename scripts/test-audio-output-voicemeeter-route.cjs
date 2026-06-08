const { EventEmitter } = require("node:events");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { prepareAudioOutputHelper } = require("./audio-output-helper-path.cjs");
const { resolveReportPathFromEnv } = require("./audio-output-proof-dir.cjs");

const projectRoot = path.resolve(__dirname, "..");
const protocolVersion = 2;
const VOICEMEETER_CONFIGURE_TIMEOUT_MS = 30_000;
const nativePlaybackStartedStates = new Set(["starting", "playing", "ended"]);

function fail(message, error) {
  console.error(`[audio-output-voicemeeter] ${message}`);
  if (error) {
    console.error(error);
  }
  process.exit(1);
}

function parseIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeVoicemeeterBus(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return ["A1", "A2", "A3", "B1", "B2", "B3"].includes(normalized)
    ? normalized
    : "A1";
}

function createVoicemeeterPlaybackWavBuffer() {
  const sampleRate = 48_000;
  const channels = 2;
  const bitsPerSample = 16;
  const durationSeconds = 0.5;
  const frequencyHz = 880;
  const frames = Math.floor(sampleRate * durationSeconds);
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate) * 0.2 * 32767,
    );
    for (let channel = 0; channel < channels; channel += 1) {
      buffer.writeInt16LE(sample, 44 + frame * blockAlign + channel * 2);
    }
  }

  return buffer;
}

function createVoicemeeterPlaybackSample() {
  const buffer = createVoicemeeterPlaybackWavBuffer();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "luo-voicemeeter-playback-"));
  const samplePath = path.join(directory, "voicemeeter-native-playback.wav");
  fs.writeFileSync(samplePath, buffer);

  return {
    path: samplePath,
    directory,
    byteSize: buffer.length,
    sha256: sha256(buffer),
  };
}

function cleanupVoicemeeterPlaybackSample(sample) {
  const directory = sample?.directory;
  if (!directory) {
    return;
  }

  const resolvedDirectory = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  const tempPrefix = `luo-voicemeeter-playback-`;
  const staysInTemp =
    resolvedDirectory.startsWith(`${tempRoot}${path.sep}`) &&
    path.basename(resolvedDirectory).startsWith(tempPrefix);
  if (!staysInTemp) {
    console.warn(
      `[audio-output-voicemeeter] skipped cleanup for unexpected temp path: ${resolvedDirectory}`,
    );
    return;
  }

  fs.rmSync(resolvedDirectory, { recursive: true, force: true });
}

function resolveReportPath() {
  return resolveReportPathFromEnv(
    "LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT",
    "voicemeeter",
  );
}

function writeReportIfRequested(report) {
  if (!report.reportPath) {
    return;
  }

  fs.mkdirSync(path.dirname(report.reportPath), { recursive: true });
  fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function createNativePlaybackProof(sample, playbackToken, status, error = null) {
  const started = Boolean(
    status &&
      status.nativePlaybackSource === sample.path &&
      status.nativePlaybackToken === playbackToken &&
      status.requestedMode === "voicemeeter" &&
      status.activeMode === "voicemeeter" &&
      nativePlaybackStartedStates.has(status.nativePlaybackState),
  );

  return {
    attempted: true,
    started,
    path: sample.path,
    byteSize: sample.byteSize,
    sha256: sample.sha256,
    playbackToken,
    requestedMode: status?.requestedMode,
    activeMode: status?.activeMode,
    nativePlaybackState: status?.nativePlaybackState,
    nativePlaybackSource: status?.nativePlaybackSource,
    reason: status?.reason,
    nativePlaybackError: status?.nativePlaybackError,
    error,
  };
}

function sendCommand(helper, command) {
  helper.stdin.write(`${JSON.stringify(command)}\n`);
}

function waitForEvent(events, predicate, label, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fromIndex = options.fromIndex ?? 0;
  const existingEvent = events.history.slice(fromIndex).find(predicate);
  if (existingEvent) {
    return Promise.resolve(existingEvent);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);
    const onEvent = (event) => {
      if (!predicate(event)) {
        return;
      }

      cleanup();
      resolve(event);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      events.off("event", onEvent);
    };

    events.on("event", onEvent);
  });
}

function attachHelperEventParser(helper) {
  const events = new EventEmitter();
  events.history = [];
  let buffer = "";

  helper.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    for (;;) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      try {
        const event = JSON.parse(line);
        events.history.push(event);
        events.emit("event", event);
      } catch (error) {
        const event = {
          type: "log",
          level: "warn",
          message: `Ignored non-JSON helper stdout: ${line}; ${error.message}`,
        };
        events.history.push(event);
        events.emit("event", event);
      }
    }
  });

  helper.stderr.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  return events;
}

async function stopHelper(helper) {
  if (helper.exitCode !== null) {
    return;
  }

  sendCommand(helper, { type: "stopPlayback" });
  sendCommand(helper, { type: "shutdown" });

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      helper.kill();
      resolve();
    }, 2_000);
    helper.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function isVoicemeeterRouteReady(status, requestedBus) {
  const remote = status?.voicemeeterRemote;
  const normalizedRequestedBus = normalizeVoicemeeterBus(requestedBus);
  return Boolean(
    status?.requestedMode === "voicemeeter" &&
    remote?.available === true &&
    remote?.connected &&
    remote.routeApplied === true &&
    remote.routeManaged === true &&
    normalizeVoicemeeterBus(remote.routeBus) === normalizedRequestedBus,
  );
}

function isVoicemeeterRouteRestored(status, requestedBus) {
  const remote = status?.voicemeeterRemote;
  const normalizedRequestedBus = normalizeVoicemeeterBus(requestedBus);
  return Boolean(
    status?.requestedMode === "voicemeeter" &&
    remote?.available === true &&
    remote.connected &&
    typeof remote.routeApplied === "boolean" &&
    remote.routeManaged === false &&
    normalizeVoicemeeterBus(remote.routeBus) === normalizedRequestedBus,
  );
}

function isVoicemeeterLevelActivityDetected(status, requestedBus) {
  const probe = status?.voicemeeterRemote?.levelProbe;
  const normalizedRequestedBus = normalizeVoicemeeterBus(requestedBus);
  const target = probe?.target || "outputBus";
  return Boolean(
    probe?.active === true &&
    normalizeVoicemeeterBus(probe.bus) === normalizedRequestedBus &&
    (target === "outputBus" ||
      (target === "virtualInput" && Number.isInteger(probe.strip))) &&
    Number.isFinite(probe.maxLevel) &&
    Number.isFinite(probe.threshold) &&
    probe.maxLevel > probe.threshold &&
    Number.isFinite(probe.activeSamples) &&
    probe.activeSamples > 0,
  );
}

async function main() {
  if (process.platform !== "win32") {
    console.warn(
      "[audio-output-voicemeeter] skipping: Voicemeeter Remote API is Windows-only",
    );
    return;
  }

  const helperInfo = prepareAudioOutputHelper({ projectRoot });

  const deviceId = process.env.LUO_AUDIO_OUTPUT_TEST_DEVICE_ID || "";
  const bus = normalizeVoicemeeterBus(
    process.env.LUO_AUDIO_OUTPUT_VOICEMEETER_BUS || "A1",
  );
  const durationMs = parseIntegerEnv("LUO_AUDIO_OUTPUT_TEST_DURATION_MS", 500);
  const frequencyHz = parseIntegerEnv(
    "LUO_AUDIO_OUTPUT_TEST_FREQUENCY_HZ",
    440,
  );
  const manualAudibilityConfirmed = parseBooleanEnv(
    "LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED",
    false,
  );
  const playbackSample = createVoicemeeterPlaybackSample();
  const playbackToken = `voicemeeter-native-proof-${Date.now()}`;
  const reportPath = resolveReportPath();
  const helper = spawn(helperInfo.helperPath, [], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const events = attachHelperEventParser(helper);

  try {
    await waitForEvent(
      events,
      (event) => event.type === "ready",
      "helper ready",
    );
    sendCommand(helper, {
      type: "initialize",
      payload: { protocolVersion },
    });
    await waitForEvent(
      events,
      (event) => event.type === "status",
      "initial status",
    );
    sendCommand(helper, {
      type: "configure",
      payload: {
        enabled: true,
        settings: {
          mode: "voicemeeter",
          sharedDeviceId: "",
          deviceId,
          bufferFrames: 960,
          fallbackToShared: true,
          voicemeeterBus: bus,
          diagnosticsEnabled: true,
        },
      },
    });
    const configureEvent = await waitForEvent(
      events,
      (event) =>
        event.type === "status" &&
        event.payload?.requestedMode === "voicemeeter" &&
        event.payload?.voicemeeterRemote,
      "Voicemeeter configure route status",
      { timeoutMs: VOICEMEETER_CONFIGURE_TIMEOUT_MS },
    );

    const afterConfigureIndex = events.history.length;
    sendCommand(helper, {
      type: "playTestTone",
      payload: {
        durationMs,
        frequencyHz,
      },
    });
    const testToneEvent = await waitForEvent(
      events,
      (event) =>
        event.type === "status" &&
        event.payload?.requestedMode === "voicemeeter" &&
        event.payload?.voicemeeterRemote,
      "Voicemeeter test tone route status",
      {
        fromIndex: afterConfigureIndex,
        timeoutMs: Math.max(15_000, durationMs + 5_000),
      },
    );

    const routeReady =
      isVoicemeeterRouteReady(configureEvent.payload, bus) ||
      isVoicemeeterRouteReady(testToneEvent.payload, bus);
    const routeStatus = isVoicemeeterRouteReady(testToneEvent.payload, bus)
      ? testToneEvent.payload.voicemeeterRemote
      : configureEvent.payload.voicemeeterRemote;
    const levelProbe = testToneEvent.payload?.voicemeeterRemote?.levelProbe;
    const levelActivityDetected = isVoicemeeterLevelActivityDetected(
      testToneEvent.payload,
      bus,
    );
    const playCommandIndex = events.history.length;
    sendCommand(helper, {
      type: "playFile",
      payload: {
        path: playbackSample.path,
        startSeconds: 0,
        volume: 0.25,
        playbackToken,
      },
    });

    let nativePlaybackEvent = null;
    let nativePlaybackError = null;
    try {
      nativePlaybackEvent = await waitForEvent(
        events,
        (event) =>
          event.type === "status" &&
          event.payload?.nativePlaybackSource === playbackSample.path &&
          event.payload?.nativePlaybackToken === playbackToken &&
          (nativePlaybackStartedStates.has(event.payload?.nativePlaybackState) ||
            event.payload?.nativePlaybackState === "error"),
        "Voicemeeter native playback status",
        { fromIndex: playCommandIndex, timeoutMs: 15_000 },
      );
    } catch (error) {
      nativePlaybackError = error instanceof Error ? error.message : String(error);
    }
    const nativePlayback = createNativePlaybackProof(
      playbackSample,
      playbackToken,
      nativePlaybackEvent?.payload,
      nativePlaybackError,
    );
    const afterNativePlaybackIndex = events.history.length;
    sendCommand(helper, { type: "stopPlayback" });
    let restoreEvent = null;
    let restoreError = null;
    if (routeReady) {
      try {
        restoreEvent = await waitForEvent(
          events,
          (event) =>
            event.type === "status" &&
            isVoicemeeterRouteRestored(event.payload, bus),
          "Voicemeeter route restore status",
          { fromIndex: afterNativePlaybackIndex, timeoutMs: 5_000 },
        );
      } catch (error) {
        restoreError = error instanceof Error ? error.message : String(error);
      }
    }

    const routeRestored = Boolean(restoreEvent);
    const verdict =
      routeReady && routeRestored
        ? "routed-and-restored"
        : routeReady
          ? "routed-not-restored"
          : "not-routed";
    const report = {
      verdict,
      proof: "voicemeeter-remote-route-and-restore",
      requiresManualAudibilityCheck: true,
      manualAudibilityConfirmed,
      reportPath: reportPath ?? undefined,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      deviceId,
      bus,
      routeApplied: routeStatus?.routeApplied === true,
      routeManaged: routeStatus?.routeManaged === true,
      routeRestored,
      routeBus: routeStatus?.routeBus,
      remoteKind: routeStatus?.kind,
      virtualInputStrip: routeStatus?.virtualInputStrip,
      levelActivityDetected,
      levelProbe,
      nativePlayback,
      configureStatus: configureEvent.payload,
      testToneStatus: testToneEvent.payload,
      nativePlaybackStatus: nativePlaybackEvent?.payload,
      restoreStatus: restoreEvent?.payload,
      restoreError,
      missingProof: manualAudibilityConfirmed
        ? levelActivityDetected || nativePlayback.started
          ? []
          : [
              "Voicemeeter Remote API output level activity while the test tone is playing or native Voicemeeter playFile startup proof",
            ]
        : [
            "manual confirmation that test tone is heard on the selected Voicemeeter bus",
            ...(levelActivityDetected || nativePlayback.started
              ? []
              : [
                  "Voicemeeter Remote API output level activity while the test tone is playing or native Voicemeeter playFile startup proof",
                ]),
          ],
    };

    writeReportIfRequested(report);
    console.log(JSON.stringify(report, null, 2));

    if (verdict !== "routed-and-restored") {
      process.exitCode = 2;
    }
  } finally {
    await stopHelper(helper);
    cleanupVoicemeeterPlaybackSample(playbackSample);
  }
}

main().catch((error) => {
  fail("Voicemeeter route verification failed", error);
});
