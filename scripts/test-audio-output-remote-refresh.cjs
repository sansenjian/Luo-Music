const { EventEmitter } = require("node:events");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");

const { prepareAudioOutputHelper } = require("./audio-output-helper-path.cjs");
const { resolveReportPathFromEnv } = require("./audio-output-proof-dir.cjs");

const defaultRangeHeader =
  process.env.LUO_AUDIO_OUTPUT_REMOTE_RANGE || "bytes=0-65535";
const expiredUrlEnv = "LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL";
const expiredHeadersEnv = "LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS";
const freshUrlEnv = "LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL";
const freshHeadersEnv = "LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS";
const nativePlaybackEnv = "LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK";
const nativePlaybackModeEnv = "LUO_AUDIO_OUTPUT_REMOTE_NATIVE_MODE";
const nativePlaybackSkipHelperEnv =
  "LUO_AUDIO_OUTPUT_REMOTE_NATIVE_SKIP_HELPER";
const nativePlaybackStates = new Set(["starting", "playing", "ended"]);
const projectRoot = path.resolve(__dirname, "..");
const protocolVersion = 2;

function fail(message, error) {
  console.error(`[audio-output-remote-refresh] ${message}`);
  if (error) {
    console.error(error);
  }
  process.exit(1);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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

function parseIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNativePlaybackMode(value) {
  const normalized = String(value || "shared")
    .trim()
    .toLowerCase();

  if (
    normalized === "shared" ||
    normalized === "exclusive" ||
    normalized === "voicemeeter"
  ) {
    return normalized;
  }

  fail(
    `${nativePlaybackModeEnv} must be one of shared, exclusive, or voicemeeter.`,
  );
}

function resolveReportPath() {
  return resolveReportPathFromEnv(
    "LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT",
    "remote",
  );
}

function writeReportIfRequested(report) {
  if (!report.reportPath) {
    return;
  }

  fs.mkdirSync(path.dirname(report.reportPath), { recursive: true });
  fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
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
  if (!helper || helper.exitCode !== null) {
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

function createTinyWavBuffer() {
  const sampleRate = 44_100;
  const channels = 1;
  const bitsPerSample = 16;
  const frames = 4096;
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

  return buffer;
}

function parseHeadersEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([key, value]) =>
            typeof key === "string" &&
            key.trim().length > 0 &&
            typeof value === "string" &&
            value.trim().length > 0,
        )
        .map(([key, value]) => [key.trim(), value]),
    );
  } catch (error) {
    fail(
      `${name} must be a JSON object such as {"Authorization":"Bearer token"}`,
      error,
    );
  }
}

function withoutRangeHeader(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "range"),
  );
}

function createRequestHeaders(headers, rangeHeader) {
  return {
    ...withoutRangeHeader(headers),
    Range: rangeHeader,
  };
}

function classifyAuthorization(value) {
  if (!value) {
    return "missing";
  }

  const normalized = String(value).toLowerCase();
  if (normalized.includes("fresh")) {
    return "fresh";
  }
  if (normalized.includes("expired")) {
    return "expired";
  }
  return "present";
}

function summarizeHeaderNames(headers) {
  return Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
}

function normalizeContentType(contentType) {
  return String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isCacheableAudioContentType(contentType) {
  const normalized = normalizeContentType(contentType);
  return (
    normalized.startsWith("audio/") ||
    normalized === "application/octet-stream" ||
    normalized === "binary/octet-stream" ||
    normalized === "application/mp4" ||
    normalized === "video/mp4"
  );
}

function parseRangeHeader(rangeHeader, totalBytes) {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(String(rangeHeader || "").trim());
  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1], 10);
  const requestedEnd = match[2]
    ? Number.parseInt(match[2], 10)
    : totalBytes - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start >= totalBytes
  ) {
    return null;
  }

  const end = Math.min(requestedEnd, totalBytes - 1);
  if (end < start) {
    return null;
  }

  return { start, end };
}

function createMockServer() {
  const audioBytes = createTinyWavBuffer();
  const requestLog = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const authorization = request.headers.authorization;
    const cookie = request.headers.cookie;
    requestLog.push({
      path: url.pathname,
      range: request.headers.range || "",
      authorization: classifyAuthorization(authorization),
      hasCookie: Boolean(cookie),
    });

    if (url.pathname === "/expired-track.wav") {
      response.writeHead(403, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("expired");
      return;
    }

    if (url.pathname !== "/fresh-track.wav") {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("not found");
      return;
    }

    if (authorization !== "Bearer fresh-token") {
      response.writeHead(403, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("fresh token required");
      return;
    }

    const range = parseRangeHeader(request.headers.range, audioBytes.length);
    if (!range) {
      response.writeHead(200, {
        "Accept-Ranges": "bytes",
        "Content-Length": audioBytes.length,
        "Content-Type": "audio/wav",
      });
      response.end(audioBytes);
      return;
    }

    const chunk = audioBytes.subarray(range.start, range.end + 1);
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": chunk.length,
      "Content-Range": `bytes ${range.start}-${range.end}/${audioBytes.length}`,
      "Content-Type": "audio/wav",
    });
    response.end(chunk);
  });

  return { audioBytes, requestLog, server };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function fetchWithRange(url, headers, rangeHeader) {
  const requestHeaders = createRequestHeaders(headers, rangeHeader);
  const response = await fetch(url, {
    headers: requestHeaders,
    redirect: "manual",
  });
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    status: response.status,
    ok: response.ok,
    bytesReceived: bytes.length,
    bodySha256: sha256(bytes),
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range"),
    contentType: response.headers.get("content-type"),
    rangeSupported:
      response.status === 206 ||
      response.headers.get("accept-ranges") === "bytes",
    requestedHeaderNames: summarizeHeaderNames(requestHeaders),
  };
}

async function fetchWholeFreshAudio(url, headers) {
  const response = await fetch(url, {
    headers: withoutRangeHeader(headers),
    redirect: "manual",
  });
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    status: response.status,
    ok: response.ok,
    bytes,
    bytesReceived: bytes.length,
    bodySha256: sha256(bytes),
    contentLength: response.headers.get("content-length"),
    contentType: response.headers.get("content-type"),
    requestedHeaderNames: summarizeHeaderNames(withoutRangeHeader(headers)),
  };
}

function extensionForContentType(contentType, fallbackUrl) {
  const normalized = normalizeContentType(contentType);
  const urlExtension = path
    .extname(new URL(fallbackUrl).pathname)
    .toLowerCase();
  if (urlExtension && /^[a-z0-9.]+$/.test(urlExtension)) {
    return urlExtension;
  }

  switch (normalized) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/flac":
    case "audio/x-flac":
      return ".flac";
    case "audio/ogg":
    case "application/ogg":
      return ".ogg";
    case "audio/aac":
      return ".aac";
    case "audio/mp4":
    case "application/mp4":
    case "video/mp4":
      return ".m4a";
    case "audio/x-wav":
    case "audio/wav":
    case "audio/wave":
      return ".wav";
    default:
      return ".bin";
  }
}

async function verifyNativePlaybackFromFreshAudio(scenario, options = {}) {
  const wholeFresh = await fetchWholeFreshAudio(
    scenario.freshUrl,
    scenario.freshHeaders,
  );
  const cacheable =
    (wholeFresh.status === 200 || wholeFresh.status === 206) &&
    wholeFresh.bytesReceived > 0 &&
    isCacheableAudioContentType(wholeFresh.contentType);
  if (!cacheable) {
    return {
      attempted: true,
      started: false,
      freshStatus: wholeFresh.status,
      bytesReceived: wholeFresh.bytesReceived,
      contentType: wholeFresh.contentType,
      reason: "Fresh full response was not cacheable audio.",
    };
  }

  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "luo-remote-native-"));
  const extension = extensionForContentType(
    wholeFresh.contentType,
    scenario.freshUrl,
  );
  const cachePath = path.join(cacheDir, `fresh-audio${extension}`);
  fs.writeFileSync(cachePath, wholeFresh.bytes);

  const nativeMode = normalizeNativePlaybackMode(
    process.env[nativePlaybackModeEnv],
  );

  if (parseBooleanEnv(nativePlaybackSkipHelperEnv, false)) {
    return {
      attempted: true,
      started: false,
      cachePath,
      extension,
      bytesReceived: wholeFresh.bytesReceived,
      bodySha256: wholeFresh.bodySha256,
      contentType: wholeFresh.contentType,
      requestedMode: nativeMode,
      reason: `Native helper startup skipped by ${nativePlaybackSkipHelperEnv}.`,
    };
  }

  const helperInfo = prepareAudioOutputHelper({ projectRoot });

  const helper = spawn(helperInfo.helperPath, [], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const events = attachHelperEventParser(helper);
  const deviceId = process.env.LUO_AUDIO_OUTPUT_TEST_DEVICE_ID || "";
  const timeoutMs = parseIntegerEnv(
    "LUO_AUDIO_OUTPUT_REMOTE_NATIVE_TIMEOUT_MS",
    15_000,
  );

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
          mode: nativeMode,
          sharedDeviceId: nativeMode === "shared" ? deviceId : "",
          deviceId,
          bufferFrames: 960,
          fallbackToShared: nativeMode === "shared",
          bitPerfectRequired: false,
          voicemeeterBus: "A1",
          diagnosticsEnabled: true,
        },
      },
    });
    await waitForEvent(
      events,
      (event) =>
        event.type === "status" &&
        event.payload?.requestedMode === nativeMode &&
        Array.isArray(event.payload?.supportedExtensions),
      "native helper capability status",
    );

    const fromIndex = events.history.length;
    sendCommand(helper, {
      type: "playFile",
      payload: {
        path: cachePath,
        startSeconds: 0,
        volume: options.volume ?? 0,
      },
    });
    const playbackEvent = await waitForEvent(
      events,
      (event) =>
        event.type === "status" &&
        event.payload?.nativePlaybackSource === cachePath &&
        (nativePlaybackStates.has(event.payload?.nativePlaybackState) ||
          event.payload?.nativePlaybackState === "error"),
      "native playback status for refreshed remote audio",
      { fromIndex, timeoutMs },
    );
    const status = playbackEvent.payload;
    const started = nativePlaybackStates.has(status.nativePlaybackState);

    return {
      attempted: true,
      started,
      cachePath,
      extension,
      bytesReceived: wholeFresh.bytesReceived,
      bodySha256: wholeFresh.bodySha256,
      contentType: wholeFresh.contentType,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      requestedMode: nativeMode,
      nativePlaybackState: status.nativePlaybackState,
      nativePlaybackSource: status.nativePlaybackSource,
      activeMode: status.activeMode,
      nativePlaybackError: status.nativePlaybackError,
      reason: status.reason,
    };
  } catch (error) {
    return {
      attempted: true,
      started: false,
      cachePath,
      extension,
      bytesReceived: wholeFresh.bytesReceived,
      bodySha256: wholeFresh.bodySha256,
      contentType: wholeFresh.contentType,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      requestedMode: nativeMode,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await stopHelper(helper);
  }
}

function resolveScenarioFromEnv() {
  const expiredUrl = process.env[expiredUrlEnv];
  const freshUrl = process.env[freshUrlEnv];
  if (!expiredUrl && !freshUrl) {
    return null;
  }

  if (!expiredUrl || !freshUrl) {
    fail(`${expiredUrlEnv} and ${freshUrlEnv} must be provided together.`);
  }

  return {
    mode: "live",
    expiredUrl,
    expiredHeaders: parseHeadersEnv(expiredHeadersEnv),
    freshUrl,
    freshHeaders: parseHeadersEnv(freshHeadersEnv),
    expectedAudioSha256: null,
    requestLog: null,
    cleanup: async () => {},
  };
}

async function createMockScenario() {
  const { audioBytes, requestLog, server } = createMockServer();
  const address = await listen(server);
  const origin = `http://${address.address}:${address.port}`;

  return {
    mode: "mock",
    expiredUrl: `${origin}/expired-track.wav`,
    expiredHeaders: {
      Authorization: "Bearer expired-token",
      Cookie: "MUSIC_U=expired",
    },
    freshUrl: `${origin}/fresh-track.wav`,
    freshHeaders: {
      Authorization: "Bearer fresh-token",
      Cookie: "MUSIC_U=fresh",
    },
    expectedAudioSha256: sha256(audioBytes),
    requestLog,
    cleanup: async () => {
      await closeServer(server);
    },
  };
}

function createReport(
  scenario,
  expiredResult,
  freshResult,
  nativePlaybackProof,
) {
  const reportPath = resolveReportPath();
  const expiredRejected =
    expiredResult.status === 401 || expiredResult.status === 403;
  const freshAccepted =
    freshResult.status === 200 || freshResult.status === 206;
  const freshRangeUsable =
    freshResult.status === 206 && Boolean(freshResult.contentRange);
  const freshCacheable = freshAccepted && freshResult.bytesReceived > 0;
  const freshContentTypeAccepted = isCacheableAudioContentType(
    freshResult.contentType,
  );
  const mockFreshBodyMatches =
    scenario.expectedAudioSha256 === null ||
    freshResult.bodySha256 === scenario.expectedAudioSha256 ||
    freshResult.status === 206;
  const verdict =
    expiredRejected &&
    freshCacheable &&
    freshContentTypeAccepted &&
    mockFreshBodyMatches
      ? "refreshable"
      : "not-refreshable";

  return {
    verdict,
    proof: freshRangeUsable ? "remote-refresh-range" : "remote-refresh-cache",
    mode: scenario.mode,
    reportPath: reportPath ?? undefined,
    rangeHeader: defaultRangeHeader,
    expired: {
      status: expiredResult.status,
      rejectedAsExpiredAuth: expiredRejected,
      bytesReceived: expiredResult.bytesReceived,
      requestedHeaderNames: expiredResult.requestedHeaderNames,
    },
    fresh: {
      status: freshResult.status,
      acceptedAfterRefresh: freshAccepted,
      cacheableAfterRefresh: freshCacheable,
      rangeSupported: freshResult.rangeSupported,
      contentRange: freshResult.contentRange,
      contentType: freshResult.contentType,
      contentTypeAccepted: freshContentTypeAccepted,
      bytesReceived: freshResult.bytesReceived,
      bodySha256: freshResult.bodySha256,
      requestedHeaderNames: freshResult.requestedHeaderNames,
    },
    mockRequestProof: scenario.requestLog
      ? {
          expiredRequestUsedExpiredAuthorization: scenario.requestLog.some(
            (entry) =>
              entry.path === "/expired-track.wav" &&
              entry.authorization === "expired",
          ),
          freshRequestUsedFreshAuthorization: scenario.requestLog.some(
            (entry) =>
              entry.path === "/fresh-track.wav" &&
              entry.authorization === "fresh",
          ),
          requests: scenario.requestLog,
        }
      : undefined,
    nativePlayback: nativePlaybackProof,
    missingProof: [
      "does not prove the remote URL came from a real platform adapter unless live LUO_AUDIO_OUTPUT_REMOTE_* inputs were captured from that adapter",
      "requires a fresh response content type that looks like cacheable audio, not an HTML login page or JSON error payload",
      ...(nativePlaybackProof?.started
        ? []
        : [
            `set ${nativePlaybackEnv}=1 to prove the refreshed audio bytes can start through the native helper`,
          ]),
    ],
  };
}

async function main() {
  const scenario = resolveScenarioFromEnv() || (await createMockScenario());

  try {
    const expiredResult = await fetchWithRange(
      scenario.expiredUrl,
      scenario.expiredHeaders,
      defaultRangeHeader,
    );
    const freshResult = await fetchWithRange(
      scenario.freshUrl,
      scenario.freshHeaders,
      defaultRangeHeader,
    );
    const nativePlaybackProof = parseBooleanEnv(nativePlaybackEnv, false)
      ? await verifyNativePlaybackFromFreshAudio(scenario)
      : undefined;
    const report = createReport(
      scenario,
      expiredResult,
      freshResult,
      nativePlaybackProof,
    );

    writeReportIfRequested(report);
    console.log(JSON.stringify(report, null, 2));

    if (report.verdict !== "refreshable") {
      process.exitCode = 2;
    }
  } finally {
    await scenario.cleanup();
  }
}

if (require.main === module) {
  main().catch((error) => {
    fail(error?.message || "Remote refresh verification failed.", error);
  });
}
