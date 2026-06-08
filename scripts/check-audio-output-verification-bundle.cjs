const fs = require("node:fs");
const path = require("node:path");

const reportTypes = [
  "remote",
  "voicemeeter",
  "bitPerfect",
  "loopback",
  "format",
];
const bundleReportEnv = "LUO_AUDIO_OUTPUT_VERIFICATION_BUNDLE_REPORT";
const defaultMinimumFormatSampleCoverageRatio = 0.75;

const reportDefinitions = {
  remote: {
    label: "online native remote refresh",
    env: "LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT",
  },
  voicemeeter: {
    label: "Voicemeeter route and restore",
    env: "LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT",
  },
  bitPerfect: {
    label: "bit-perfect candidate",
    env: "LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT",
  },
  loopback: {
    label: "bit-perfect loopback",
    env: "LUO_AUDIO_OUTPUT_LOOPBACK_REPORT",
  },
  format: {
    label: "format matrix",
    env: "LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT",
  },
};

function usage() {
  return [
    "Usage:",
    "  node scripts/check-audio-output-verification-bundle.cjs [options]",
    "",
    "Options:",
    "  --remote <report.json>       Remote URL refresh report. Env: LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT",
    "  --voicemeeter <report.json>  Voicemeeter route/restore report. Env: LUO_AUDIO_OUTPUT_VOICEMEETER_ROUTE_REPORT",
    "  --bit-perfect <report.json>  Bit-perfect candidate report. Env: LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT",
    "  --loopback <report.json>     Loopback comparison report. Env: LUO_AUDIO_OUTPUT_LOOPBACK_REPORT",
    "  --format <report.json>       Format matrix report. May be repeated. Env: LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT",
    "  --require-remote-native-mode <mode> Require remote native helper playback in shared, exclusive, or voicemeeter mode",
    "  --require-format-platform <platform> Require an accepted format report for this platform. May be repeated",
    "  --min-format-sample-coverage <ratio> Minimum supported-extension sample startup coverage for final format proof. Default: 0.75",
    "  --require-all-format-samples Require sample startup coverage for every declared supported extension",
    `  --report <report.json>       Save the bundle summary report. Env: ${bundleReportEnv}`,
    "  --allow-mock-remote          Accept mock remote-refresh reports for local dry runs",
    "  --allow-remote-refresh-only  Accept remote refresh reports without native helper playback for local dry runs",
    "  --allow-format-manifest-only Accept manifest-only format reports for local dry runs",
    "  --allow-partial-format-samples Accept samples-started reports with unsampled extensions for dry runs",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    format: [],
    requiredFormatPlatforms: [],
    minFormatSampleCoverage: defaultMinimumFormatSampleCoverageRatio,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--remote":
        options.remote = next();
        break;
      case "--voicemeeter":
        options.voicemeeter = next();
        break;
      case "--bit-perfect":
        options.bitPerfect = next();
        break;
      case "--loopback":
        options.loopback = next();
        break;
      case "--format":
        options.format.push(next());
        break;
      case "--require-remote-native-mode":
        options.requiredRemoteNativeMode = normalizeNativePlaybackMode(next());
        break;
      case "--require-format-platform":
        options.requiredFormatPlatforms.push(...parsePlatformList(next()));
        break;
      case "--min-format-sample-coverage":
        options.minFormatSampleCoverage = parseFormatCoverageRatio(next());
        break;
      case "--require-all-format-samples":
        options.requireAllFormatSamples = true;
        break;
      case "--report":
        options.report = next();
        break;
      case "--allow-mock-remote":
        options.allowMockRemote = true;
        break;
      case "--allow-remote-refresh-only":
        options.allowRemoteRefreshOnly = true;
        break;
      case "--allow-format-manifest-only":
        options.allowFormatManifestOnly = true;
        break;
      case "--allow-partial-format-samples":
        options.allowPartialFormatSamples = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveBundleReportPath(options, env = process.env) {
  const reportPath = options.report || env[bundleReportEnv];
  return reportPath ? path.resolve(reportPath) : null;
}

function writeJsonReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function resolveReportPaths(options, env = process.env) {
  const paths = {
    remote: [],
    voicemeeter: [],
    bitPerfect: [],
    loopback: [],
    format: [],
  };

  for (const type of reportTypes) {
    const optionValue = options[type];
    const envValue = env[reportDefinitions[type].env];
    const values =
      type === "format"
        ? [
            ...(Array.isArray(optionValue) ? optionValue : []),
            ...(envValue ? [envValue] : []),
          ]
        : [optionValue || envValue].filter(Boolean);

    paths[type] = values.map((value) => path.resolve(value));
  }

  return paths;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePlatformList(value) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((entry) => String(entry || "").split(/[,\s;]+/))
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean);
}

function parseFormatCoverageRatio(value) {
  const raw = String(value || "").trim();
  const parsed = Number.parseFloat(raw.endsWith("%") ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid format sample coverage ratio: ${value}`);
  }

  const ratio = raw.endsWith("%") || parsed > 1 ? parsed / 100 : parsed;
  if (ratio <= 0 || ratio > 1) {
    throw new Error("Format sample coverage ratio must be greater than 0 and no more than 1.");
  }

  return ratio;
}

function normalizeExtensionName(extension) {
  const normalized = String(extension || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function normalizeExtensionList(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((extension) => normalizeExtensionName(extension))
        .filter(Boolean),
    ),
  ].sort();
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

function normalizeVoicemeeterBus(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return ["A1", "A2", "A3", "B1", "B2", "B3"].includes(normalized)
    ? normalized
    : "";
}

function normalizeVoicemeeterRemoteKind(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["standard", "banana", "potato"].includes(normalized)
    ? normalized
    : "";
}

function normalizeNativePlaybackMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["shared", "exclusive", "voicemeeter"].includes(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid remote native playback mode: ${value}. Expected shared, exclusive, or voicemeeter.`,
  );
}

function isValidSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function loadJsonReport(reportPath) {
  const raw = fs.readFileSync(reportPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!isObject(parsed)) {
    throw new Error("Report must be a JSON object");
  }
  return parsed;
}

function hasNativeVoicemeeterPlaybackProof(report) {
  const nativePlayback = isObject(report.nativePlayback)
    ? report.nativePlayback
    : undefined;
  if (!nativePlayback) {
    return false;
  }

  return Boolean(
    nativePlayback.attempted === true &&
      nativePlayback.started === true &&
      ["starting", "playing", "ended"].includes(
        String(nativePlayback.nativePlaybackState || ""),
      ) &&
      nativePlayback.requestedMode === "voicemeeter" &&
      nativePlayback.activeMode === "voicemeeter" &&
      typeof nativePlayback.path === "string" &&
      nativePlayback.path.length > 0 &&
      nativePlayback.nativePlaybackSource === nativePlayback.path &&
      typeof nativePlayback.playbackToken === "string" &&
      nativePlayback.playbackToken.length > 0 &&
      Number.isFinite(nativePlayback.byteSize) &&
      nativePlayback.byteSize > 0 &&
      isValidSha256(nativePlayback.sha256),
  );
}

function createMissingResult(type) {
  const definition = reportDefinitions[type];
  return {
    type,
    label: definition.label,
    exists: false,
    accepted: false,
    reason: `Missing ${definition.label} report. Provide --${type === "bitPerfect" ? "bit-perfect" : type} or ${definition.env}.`,
  };
}

function summarizeReport(
  type,
  reportPath,
  report,
  accepted,
  reason,
  extra = {},
) {
  return {
    type,
    label: reportDefinitions[type].label,
    path: reportPath,
    exists: true,
    accepted,
    verdict: report.verdict,
    proof: report.proof,
    reason,
    ...extra,
  };
}

function evaluateRemote(reportPath, report, options) {
  const expired = isObject(report.expired) ? report.expired : undefined;
  const fresh = isObject(report.fresh) ? report.fresh : undefined;
  const nativePlayback = isObject(report.nativePlayback)
    ? report.nativePlayback
    : undefined;
  const requiredNativeMode = options.requiredRemoteNativeMode;
  const nativePlaybackActiveMode = String(nativePlayback?.activeMode || "");
  const nativePlaybackRequestedMode = nativePlayback?.requestedMode
    ? String(nativePlayback.requestedMode)
    : "";
  const refreshable = report.verdict === "refreshable";
  const proofAccepted =
    report.proof === "remote-refresh-range" ||
    report.proof === "remote-refresh-cache";
  const liveAccepted =
    report.mode === "live" || options.allowMockRemote === true;
  const expiredRejected =
    expired?.rejectedAsExpiredAuth === true &&
    (expired.status === 401 || expired.status === 403);
  const freshCacheable =
    fresh?.acceptedAfterRefresh === true &&
    fresh.cacheableAfterRefresh === true &&
    typeof fresh.bodySha256 === "string" &&
    Number.isFinite(fresh.bytesReceived) &&
    fresh.bytesReceived > 0;
  const freshContentTypeAccepted = isCacheableAudioContentType(
    fresh?.contentType,
  );
  const rangeProofAccepted =
    report.proof !== "remote-refresh-range" ||
    (fresh?.status === 206 &&
      fresh.rangeSupported === true &&
      typeof fresh.contentRange === "string");
  const nativePlaybackAccepted =
    options.allowRemoteRefreshOnly === true ||
    (nativePlayback?.attempted === true &&
      nativePlayback.started === true &&
      ["starting", "playing", "ended"].includes(
        String(nativePlayback.nativePlaybackState || ""),
      ) &&
      (requiredNativeMode
        ? nativePlaybackRequestedMode === requiredNativeMode &&
          nativePlaybackActiveMode === requiredNativeMode
        : ["shared", "exclusive", "voicemeeter"].includes(
            nativePlaybackActiveMode,
          )) &&
      typeof nativePlayback.bodySha256 === "string" &&
      Number.isFinite(nativePlayback.bytesReceived) &&
      nativePlayback.bytesReceived > 0);
  const accepted =
    refreshable &&
    proofAccepted &&
    liveAccepted &&
    expiredRejected &&
    freshCacheable &&
    freshContentTypeAccepted &&
    rangeProofAccepted &&
    nativePlaybackAccepted;
  const reason = accepted
    ? "Remote refresh report proves expired credentials were rejected, refreshed credentials were cacheable, and refreshed audio started through the native helper."
    : !refreshable
      ? 'Remote refresh report did not finish with verdict "refreshable".'
      : !proofAccepted
        ? "Remote refresh report proof is not recognized."
        : !liveAccepted
          ? "Remote refresh report came from mock mode; rerun with live LUO_AUDIO_OUTPUT_REMOTE_* inputs for online native proof."
          : !expiredRejected
            ? "Remote refresh report must prove the expired URL/headers were rejected with 401 or 403."
            : !freshCacheable
              ? "Remote refresh report must prove refreshed URL/headers returned cacheable audio bytes."
              : !freshContentTypeAccepted
                ? "Remote refresh report must prove refreshed URL/headers returned an audio content type, not an HTML or JSON error page."
                : !rangeProofAccepted
                  ? "Range remote refresh proof must include a 206 response with Content-Range."
                  : requiredNativeMode
                    ? `Remote refresh report must prove the refreshed audio bytes started through the native helper in ${requiredNativeMode} mode.`
                    : "Remote refresh report must prove the refreshed audio bytes started through the native helper.";

  return summarizeReport("remote", reportPath, report, accepted, reason, {
    mode: report.mode,
    proofStrength: report.mode === "live" ? "live-platform" : "mock",
    expiredStatus: expired?.status,
    freshStatus: fresh?.status,
    freshBytesReceived: fresh?.bytesReceived,
    freshContentType: fresh?.contentType,
    freshContentTypeAccepted,
    freshRangeSupported: fresh?.rangeSupported,
    nativePlaybackStarted: nativePlayback?.started === true,
    nativePlaybackState: nativePlayback?.nativePlaybackState,
    nativePlaybackRequestedMode,
    nativePlaybackActiveMode: nativePlayback?.activeMode,
    nativePlaybackBytesReceived: nativePlayback?.bytesReceived,
    requiredRemoteNativeMode: requiredNativeMode,
  });
}

function evaluateVoicemeeter(reportPath, report) {
  const requestedBus = normalizeVoicemeeterBus(report.bus);
  const routeBus = normalizeVoicemeeterBus(report.routeBus);
  const levelProbe = isObject(report.levelProbe)
    ? report.levelProbe
    : undefined;
  const restoreRemote = isObject(report.restoreStatus?.voicemeeterRemote)
    ? report.restoreStatus.voicemeeterRemote
    : undefined;
  const restoreRouteBus = normalizeVoicemeeterBus(restoreRemote?.routeBus);
  const remoteKind = normalizeVoicemeeterRemoteKind(report.remoteKind);
  const restoreRemoteKind = normalizeVoicemeeterRemoteKind(restoreRemote?.kind);
  const routeBusMatchesRequest = Boolean(
    requestedBus && routeBus && requestedBus === routeBus,
  );
  const restoreReleasedManagedRoute = Boolean(
    typeof restoreRemote?.routeApplied === "boolean" &&
    restoreRemote.routeManaged === false &&
    restoreRouteBus === requestedBus,
  );
  const hasRecognizedRemoteKind = Boolean(
    remoteKind && (!restoreRemote?.kind || restoreRemoteKind === remoteKind),
  );
  const hasVirtualInputStrip =
    Number.isInteger(report.virtualInputStrip) && report.virtualInputStrip >= 0;
  const levelProbeTarget = levelProbe?.target || "outputBus";
  const hasLevelActivityProof = Boolean(
    report.levelActivityDetected === true &&
    levelProbe?.active === true &&
    normalizeVoicemeeterBus(levelProbe.bus) === requestedBus &&
    (levelProbeTarget === "outputBus" ||
      (levelProbeTarget === "virtualInput" &&
        Number.isInteger(levelProbe.strip) &&
        levelProbe.strip === report.virtualInputStrip)) &&
    Number.isFinite(levelProbe.maxLevel) &&
    Number.isFinite(levelProbe.threshold) &&
    levelProbe.maxLevel > levelProbe.threshold &&
    Number.isFinite(levelProbe.activeSamples) &&
    levelProbe.activeSamples > 0,
  );
  const nativePlayback = isObject(report.nativePlayback)
    ? report.nativePlayback
    : undefined;
  const hasNativePlaybackProof = hasNativeVoicemeeterPlaybackProof(report);
  const hasOutputProof = hasLevelActivityProof || hasNativePlaybackProof;
  const accepted =
    report.verdict === "routed-and-restored" &&
    report.proof === "voicemeeter-remote-route-and-restore" &&
    report.routeApplied === true &&
    report.routeManaged === true &&
    report.routeRestored === true &&
    report.requiresManualAudibilityCheck === true &&
    report.manualAudibilityConfirmed === true &&
    routeBusMatchesRequest &&
    hasRecognizedRemoteKind &&
    hasVirtualInputStrip &&
    hasOutputProof &&
    restoreReleasedManagedRoute;
  const reason = accepted
    ? "Voicemeeter report proves managed route application, output activity or native Voicemeeter playback, and restore."
    : !routeBusMatchesRequest
      ? "Voicemeeter report must prove the applied route bus matches the requested bus."
      : !hasRecognizedRemoteKind
        ? "Voicemeeter report must include a recognized Remote API kind and preserve it through restore."
        : !hasVirtualInputStrip
          ? "Voicemeeter report must include the managed virtual input strip index."
          : !hasOutputProof
            ? "Voicemeeter report must include Remote API output level activity while the test tone is playing or native Voicemeeter playFile startup proof."
            : !restoreReleasedManagedRoute
              ? "Voicemeeter report must include restoreStatus proving the managed route was released."
              : report.requiresManualAudibilityCheck !== true
                ? "Voicemeeter report must preserve the manual audibility confirmation requirement."
                : report.manualAudibilityConfirmed !== true
                  ? "Voicemeeter report must record manual confirmation that the test tone was heard on the selected bus."
                  : "Voicemeeter report must be routed-and-restored with routeApplied, routeManaged, and routeRestored all true.";

  return summarizeReport("voicemeeter", reportPath, report, accepted, reason, {
    requestedBus,
    routeBus,
    remoteKind,
    restoreRemoteKind,
    virtualInputStrip: report.virtualInputStrip,
    levelActivityDetected: report.levelActivityDetected === true,
    nativePlaybackProofAccepted: hasNativePlaybackProof,
    nativePlaybackStarted: nativePlayback?.started === true,
    nativePlaybackState: nativePlayback?.nativePlaybackState,
    nativePlaybackSource: nativePlayback?.nativePlaybackSource,
    nativePlaybackSha256: nativePlayback?.sha256,
    levelProbeTarget,
    levelProbeMaxLevel: levelProbe?.maxLevel,
    levelProbeActiveSamples: levelProbe?.activeSamples,
    routeRestored: report.routeRestored,
    requiresManualAudibilityCheck:
      report.requiresManualAudibilityCheck === true,
    manualAudibilityConfirmed: report.manualAudibilityConfirmed === true,
  });
}

function evaluateBitPerfect(reportPath, report) {
  const identity = isObject(report.audioFileIdentity)
    ? report.audioFileIdentity
    : undefined;
  const bitPerfectGuardAccepted = report.bitPerfectRequired === true;
  const accepted =
    report.verdict === "candidate" &&
    report.proof === "candidate-only" &&
    report.requiresExternalVerification === true &&
    bitPerfectGuardAccepted &&
    typeof identity?.sha256 === "string";
  const reason = accepted
    ? "Candidate report proves the exclusive playback path met local bit-perfect preconditions with the downgrade guard enabled."
    : !bitPerfectGuardAccepted
      ? "Bit-perfect candidate report must be captured with bitPerfectRequired=true so non-candidate playback cannot silently downgrade."
      : "Bit-perfect candidate report must be a successful candidate-only report with source identity and external verification still required.";

  return summarizeReport("bitPerfect", reportPath, report, accepted, reason, {
    audioFileSha256: identity?.sha256,
    bitPerfectRequired: bitPerfectGuardAccepted,
  });
}

function evaluateLoopback(reportPath, report) {
  const sourceSha256 =
    report.source && typeof report.source.sha256 === "string"
      ? report.source.sha256
      : undefined;
  const captureSha256 =
    report.capture && typeof report.capture.sha256 === "string"
      ? report.capture.sha256
      : undefined;
  const sourcePath =
    report.source && typeof report.source.path === "string"
      ? path.resolve(report.source.path).toLowerCase()
      : undefined;
  const capturePath =
    report.capture && typeof report.capture.path === "string"
      ? path.resolve(report.capture.path).toLowerCase()
      : undefined;
  const identicalSourceCapturePath = Boolean(
    sourcePath && capturePath && sourcePath === capturePath,
  );
  const candidateSha256 =
    report.candidate &&
    report.candidate.audioFileIdentity &&
    typeof report.candidate.audioFileIdentity.sha256 === "string"
      ? report.candidate.audioFileIdentity.sha256
      : undefined;
  const accepted =
    report.verdict === "verified" &&
    report.proof === "candidate-plus-loopback" &&
    report.verified === true &&
    report.candidateMatchedSource === true &&
    report.requiresExternalVerification === false &&
    report.partialComparison !== true &&
    report.allowFormatConversion !== true &&
    identicalSourceCapturePath !== true &&
    typeof sourceSha256 === "string" &&
    typeof candidateSha256 === "string" &&
    sourceSha256 === candidateSha256;
  const reason = accepted
    ? "Loopback report proves candidate diagnostics and capture comparison both passed."
    : "Loopback report must be a verified candidate-plus-loopback proof with matching source and embedded candidate SHA-256 values.";
  const preciseReason =
    !accepted && report.partialComparison === true
      ? "Loopback report must compare the full source range; partial comparisons are not final bit-perfect proof."
      : !accepted && report.allowFormatConversion === true
        ? "Loopback report must not allow sample format or bit-depth conversion for final bit-perfect proof."
        : !accepted && identicalSourceCapturePath
          ? "Loopback report must come from an independently captured file; source and capture paths are identical."
          : reason;

  return summarizeReport(
    "loopback",
    reportPath,
    report,
    accepted,
    preciseReason,
    {
      sourceSha256,
      captureSha256,
      candidateSha256,
      comparedFrames: report.comparedFrames,
      partialComparison: report.partialComparison === true,
      allowFormatConversion: report.allowFormatConversion === true,
      identicalSourceCapturePath,
    },
  );
}

function createCrossReportConsistencyFailures(reports) {
  const failures = [];
  const acceptedCandidates = reports.filter(
    (report) =>
      report.type === "bitPerfect" &&
      report.accepted === true &&
      typeof report.audioFileSha256 === "string",
  );
  const acceptedLoopbacks = reports.filter(
    (report) =>
      report.type === "loopback" &&
      report.accepted === true &&
      typeof report.sourceSha256 === "string" &&
      typeof report.candidateSha256 === "string",
  );

  for (const candidateReport of acceptedCandidates) {
    const matchingLoopback = acceptedLoopbacks.find(
      (loopbackReport) =>
        loopbackReport.sourceSha256 === candidateReport.audioFileSha256 &&
        loopbackReport.candidateSha256 === candidateReport.audioFileSha256,
    );

    if (!matchingLoopback) {
      failures.push({
        type: "bundleConsistency",
        label: "bit-perfect candidate/loopback consistency",
        exists: true,
        accepted: false,
        reason:
          "Bit-perfect candidate report SHA-256 does not match any accepted loopback source/candidate SHA-256 in this bundle.",
        audioFileSha256: candidateReport.audioFileSha256,
      });
    }
  }

  return failures;
}

function getPlatformModeCapabilityIssue(report) {
  const platform = typeof report.platform === "string" ? report.platform : "";
  const capabilities = isObject(report.platformModeCapabilities)
    ? report.platformModeCapabilities
    : undefined;

  if (!platform) {
    return "Format report must include platform for required platform proof.";
  }
  if (!capabilities) {
    return "Format report must include platformModeCapabilities for required platform mode proof.";
  }
  if (capabilities.shared !== true) {
    return `Format report for ${platform} must declare shared output support.`;
  }

  if (platform === "win32") {
    if (capabilities.exclusive !== true || capabilities.voicemeeter !== true) {
      return "Windows format report must declare shared, exclusive, and voicemeeter mode support.";
    }
  } else if (platform === "darwin" || platform === "linux") {
    if (capabilities.exclusive === true || capabilities.voicemeeter === true) {
      return `${platform} format report should only declare shared mode until exclusive/Voicemeeter backends are implemented there.`;
    }
  }

  return null;
}

function getFormatSampleDetails(report) {
  const supportedExtensions = normalizeExtensionList(
    report.supportedExtensions,
  );
  const sampleEntries = Array.isArray(report.samples) ? report.samples : [];
  const validSampleEntries = sampleEntries.filter(isObject);
  const startedSampleEntries = validSampleEntries.filter(
    (entry) => entry.status === "started",
  );
  const malformedSampleCount = sampleEntries.length - validSampleEntries.length;
  const sampleEntryExtensions = normalizeExtensionList(
    validSampleEntries.map((entry) => entry.extension),
  );
  const startedSampleExtensions = normalizeExtensionList(
    startedSampleEntries.map((entry) => entry.extension),
  );
  const failedSampleCount = validSampleEntries.filter(
    (entry) => entry.status !== "started",
  ).length;
  const missingStartedSampleIdentityCount = startedSampleEntries.filter(
    (entry) =>
      !Number.isFinite(entry.byteSize) ||
      entry.byteSize <= 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(entry.sha256),
  ).length;
  const missingStartedSampleExtensions = supportedExtensions.filter(
    (extension) => !startedSampleExtensions.includes(extension),
  );
  const startedSupportedSampleExtensions = startedSampleExtensions.filter(
    (extension) => supportedExtensions.includes(extension),
  );
  const startedSampleCoverageRatio =
    supportedExtensions.length > 0
      ? startedSupportedSampleExtensions.length / supportedExtensions.length
      : 0;
  const overclaimedSampleExtensions = normalizeExtensionList(
    report.sampledExtensions,
  ).filter((extension) => !sampleEntryExtensions.includes(extension));
  const hasSampleDetails =
    sampleEntries.length > 0 && malformedSampleCount === 0;
  const hasStartedSample = startedSampleExtensions.length > 0;
  const hasCompleteStartedCoverage =
    supportedExtensions.length > 0 &&
    missingStartedSampleExtensions.length === 0;

  return {
    supportedExtensions,
    sampleEntryExtensions,
    startedSampleExtensions,
    startedSupportedSampleExtensions,
    startedSampleCoverageRatio,
    failedSampleCount,
    missingStartedSampleIdentityCount,
    malformedSampleCount,
    missingStartedSampleExtensions,
    overclaimedSampleExtensions,
    hasSampleDetails,
    hasStartedSample,
    hasCompleteStartedCoverage,
  };
}

function createRequiredFormatPlatformFailures(reports, options) {
  const requiredPlatforms = [
    ...new Set(parsePlatformList(options.requiredFormatPlatforms ?? [])),
  ];
  if (requiredPlatforms.length === 0) {
    return [];
  }

  const acceptedFormatPlatforms = new Set(
    reports
      .filter((report) => report.type === "format" && report.accepted === true)
      .map((report) => report.platform)
      .filter((platform) => typeof platform === "string")
      .map((platform) => platform.toLowerCase()),
  );

  return requiredPlatforms
    .filter((platform) => !acceptedFormatPlatforms.has(platform))
    .map((platform) => ({
      type: "bundleConsistency",
      label: "required platform format evidence",
      exists: true,
      accepted: false,
      reason: `Missing accepted format matrix report for required platform: ${platform}.`,
      platform,
    }));
}

function evaluateFormat(reportPath, report, options) {
  const missingSampleExtensions = Array.isArray(report.missingSampleExtensions)
    ? report.missingSampleExtensions
    : [];
  const missingExpectedSampleExtensions = Array.isArray(
    report.missingExpectedSampleExtensions,
  )
    ? report.missingExpectedSampleExtensions
    : [];
  const unsupportedExpectedExtensions = Array.isArray(
    report.unsupportedExpectedExtensions,
  )
    ? report.unsupportedExpectedExtensions
    : [];
  const platformModeIssue = getPlatformModeCapabilityIssue(report);
  const sampleDetails = getFormatSampleDetails(report);
  const allDeclaredExtensionsSampled = missingSampleExtensions.length === 0;
  const hasCompleteFormatCoverage =
    allDeclaredExtensionsSampled && sampleDetails.hasCompleteStartedCoverage;
  const minimumCoverageRatio = parseFormatCoverageRatio(
    options.minFormatSampleCoverage ??
      defaultMinimumFormatSampleCoverageRatio,
  );
  const hasFinalMajorityCoverage =
    sampleDetails.supportedExtensions.length > 0 &&
    sampleDetails.startedSampleCoverageRatio >= minimumCoverageRatio;
  const sampleDetailsIssue = !sampleDetails.hasSampleDetails
    ? "Format report must include per-sample startup details from the helper."
    : !sampleDetails.hasStartedSample
      ? "Format report must include at least one successfully started sample."
      : sampleDetails.failedSampleCount > 0 &&
          options.requireAllFormatSamples === true
        ? "Format report contains failed sample startup entries."
        : sampleDetails.malformedSampleCount > 0
          ? "Format report contains malformed sample entries."
          : sampleDetails.missingStartedSampleIdentityCount > 0
            ? "Format report must include byteSize and SHA-256 for every started sample."
            : sampleDetails.overclaimedSampleExtensions.length > 0
              ? `Format report claims sampled extensions without started sample details: ${sampleDetails.overclaimedSampleExtensions.join(", ")}.`
              : null;
  const sampleCoverageAccepted =
    (options.requireAllFormatSamples === true
      ? hasCompleteFormatCoverage
      : hasCompleteFormatCoverage || hasFinalMajorityCoverage) ||
    options.allowPartialFormatSamples === true;
  const samplesAccepted =
    report.verdict === "samples-started" &&
    report.proof === "format-sample-startup" &&
    sampleCoverageAccepted &&
    missingExpectedSampleExtensions.length === 0 &&
    unsupportedExpectedExtensions.length === 0 &&
    !sampleDetailsIssue &&
    !platformModeIssue;
  const manifestAccepted =
    options.allowFormatManifestOnly === true &&
    report.verdict === "manifest-only" &&
    report.proof === "format-capability-manifest" &&
    !platformModeIssue;
  const accepted = samplesAccepted || manifestAccepted;
  const reason = accepted
    ? samplesAccepted
      ? hasCompleteFormatCoverage
        ? "Format report includes real sample startup evidence for every declared supported extension."
        : `Format report includes real sample startup evidence for ${sampleDetails.startedSupportedSampleExtensions.length}/${sampleDetails.supportedExtensions.length} declared supported extensions, meeting the final majority coverage threshold ${Math.round(minimumCoverageRatio * 100)}%.`
      : "Format report is manifest-only and was accepted for a local dry run."
    : platformModeIssue
      ? platformModeIssue
      : sampleDetailsIssue
        ? sampleDetailsIssue
        : report.verdict === "samples-started" &&
            sampleDetails.startedSampleCoverageRatio < minimumCoverageRatio
          ? `Format report only started samples for ${sampleDetails.startedSupportedSampleExtensions.length}/${sampleDetails.supportedExtensions.length} supported extensions; final proof requires at least ${Math.round(minimumCoverageRatio * 100)}% coverage${options.requireAllFormatSamples === true ? " and all declared extensions" : ""}.`
          : report.verdict === "samples-started" &&
              missingSampleExtensions.length > 0
            ? `Format report only started samples for ${sampleDetails.startedSupportedSampleExtensions.length}/${sampleDetails.supportedExtensions.length} supported extensions; final proof requires at least ${Math.round(minimumCoverageRatio * 100)}% coverage${options.requireAllFormatSamples === true ? " and all declared extensions" : ""}.`
          : report.verdict === "samples-started" &&
              sampleDetails.missingStartedSampleExtensions.length > 0 &&
              options.allowPartialFormatSamples !== true
            ? `Format report lacks started sample details for supported extensions: ${sampleDetails.missingStartedSampleExtensions.join(", ")}.`
            : "Format report must include complete samples-started evidence; manifest-only or missing samples do not prove real decode/playback startup.";

  return summarizeReport("format", reportPath, report, accepted, reason, {
    platform: report.platform,
    platformModeCapabilities: isObject(report.platformModeCapabilities)
      ? report.platformModeCapabilities
      : undefined,
    supportedExtensions: sampleDetails.supportedExtensions,
    sampledExtensions: Array.isArray(report.sampledExtensions)
      ? report.sampledExtensions
      : undefined,
    startedSampleExtensions: sampleDetails.startedSampleExtensions,
    startedSupportedSampleExtensions:
      sampleDetails.startedSupportedSampleExtensions,
    startedSampleCoverageRatio: sampleDetails.startedSampleCoverageRatio,
    minimumStartedSampleCoverageRatio: minimumCoverageRatio,
    majoritySampleCoverage: hasFinalMajorityCoverage,
    missingSampleExtensions,
    missingStartedSampleExtensions:
      sampleDetails.missingStartedSampleExtensions,
    missingExpectedSampleExtensions,
    unsupportedExpectedExtensions,
    completeSampleCoverage: hasCompleteFormatCoverage,
    failedSampleCount: sampleDetails.failedSampleCount,
    missingStartedSampleIdentityCount:
      sampleDetails.missingStartedSampleIdentityCount,
    malformedSampleCount: sampleDetails.malformedSampleCount,
    overclaimedSampleExtensions: sampleDetails.overclaimedSampleExtensions,
  });
}

function evaluateReport(type, reportPath, report, options) {
  switch (type) {
    case "remote":
      return evaluateRemote(reportPath, report, options);
    case "voicemeeter":
      return evaluateVoicemeeter(reportPath, report);
    case "bitPerfect":
      return evaluateBitPerfect(reportPath, report);
    case "loopback":
      return evaluateLoopback(reportPath, report);
    case "format":
      return evaluateFormat(reportPath, report, options);
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

function checkVerificationBundle(options = {}, env = process.env) {
  const reportPaths = resolveReportPaths(options, env);
  const reports = [];

  for (const type of reportTypes) {
    if (reportPaths[type].length === 0) {
      reports.push(createMissingResult(type));
      continue;
    }

    for (const reportPath of reportPaths[type]) {
      if (!fs.existsSync(reportPath)) {
        reports.push({
          ...createMissingResult(type),
          path: reportPath,
          reason: `Report file does not exist: ${reportPath}`,
        });
        continue;
      }

      try {
        reports.push(
          evaluateReport(type, reportPath, loadJsonReport(reportPath), options),
        );
      } catch (error) {
        reports.push({
          type,
          label: reportDefinitions[type].label,
          path: reportPath,
          exists: true,
          accepted: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  reports.push(...createCrossReportConsistencyFailures(reports));
  reports.push(...createRequiredFormatPlatformFailures(reports, options));

  const missingProof = reports
    .filter((report) => !report.accepted)
    .map((report) => report.reason);
  const complete = missingProof.length === 0;

  return {
    verdict: complete ? "complete" : "incomplete",
    proof: "audio-output-verification-bundle",
    complete,
    reports,
    missingProof,
  };
}

function runCli(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;

  try {
    const options = parseArgs(argv);
    if (options.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }

    const report = checkVerificationBundle(options);
    const reportPath = resolveBundleReportPath(options);
    const outputReport = reportPath
      ? {
          ...report,
          reportPath,
        }
      : report;

    if (reportPath) {
      writeJsonReport(reportPath, outputReport);
    }

    stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    return outputReport.complete ? 0 : 2;
  } catch (error) {
    stderr.write(`[audio-output-verification-bundle] ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  checkVerificationBundle,
  getPlatformModeCapabilityIssue,
  normalizeVoicemeeterBus,
  parseArgs,
  parsePlatformList,
  resolveBundleReportPath,
  resolveReportPaths,
  runCli,
};
