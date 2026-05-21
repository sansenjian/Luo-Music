import { parentPort, workerData } from "node:worker_threads";

if (!parentPort) {
  throw new Error("External plugin worker requires a parentPort");
}

let requestCounter = 0;
const pendingRequests = new Map();

class PluginCallError extends Error {
  constructor(codeOrPayload, message, options = {}) {
    const payload =
      codeOrPayload && typeof codeOrPayload === "object"
        ? codeOrPayload
        : { code: codeOrPayload, message, ...options };

    super(String(payload.message ?? "Plugin call failed"));
    this.name = "PluginCallError";
    this.code = String(payload.code ?? "PLUGIN_ERROR");
    this.retryable = Boolean(payload.retryable);
    this.userMessage = typeof payload.userMessage === "string" ? payload.userMessage : undefined;
    this.details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? payload.details
        : undefined;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      userMessage: this.userMessage,
      details: this.details,
    };
  }
}

function createPluginCallError(codeOrPayload, message, options = {}) {
  return new PluginCallError(codeOrPayload, message, options);
}

function createSongUrlResult(url, options = {}) {
  if (!url) return { url: null };

  return {
    url,
    ...(options.mediaId !== undefined && options.mediaId !== null
      ? { mediaId: options.mediaId }
      : {}),
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    ...(options.level ? { level: options.level } : {}),
    ...(options.bitrate !== undefined ? { bitrate: options.bitrate } : {}),
  };
}

function createPluginSdkRuntime() {
  return Object.freeze({
    PluginCallError,
    createPluginCallError,
    createSongUrlResult,
  });
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: typeof error.code === "string" ? error.code : undefined,
      retryable: typeof error.retryable === "boolean" ? error.retryable : undefined,
      userMessage: typeof error.userMessage === "string" ? error.userMessage : undefined,
      details:
        error.details && typeof error.details === "object" && !Array.isArray(error.details)
          ? error.details
          : undefined,
    };
  }

  return {
    message: String(error),
    name: "Error",
  };
}

function createRequest(type, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `worker-request-${++requestCounter}`;
    pendingRequests.set(requestId, { resolve, reject });
    parentPort.postMessage({ type, requestId, payload });
  });
}

function createLogger(level) {
  return (message, meta = undefined) => {
    parentPort.postMessage({
      type: "log",
      payload: {
        level,
        message,
        meta,
      },
    });
  };
}

const pluginContext = {
  pluginId: workerData.pluginId,
  platformId: workerData.platformId,
  settings: Object.freeze({ ...workerData.settings }),
  storage: {
    get: (key) => createRequest("storage:get", { key }),
    set: (key, value) => createRequest("storage:set", { key, value }),
    remove: (key) => createRequest("storage:remove", { key }),
    clear: () => createRequest("storage:clear", {}),
  },
  secrets: {
    get: (key) => createRequest("secrets:get", { key }),
    set: (key, value) => createRequest("secrets:set", { key, value }),
    remove: (key) => createRequest("secrets:remove", { key }),
    clear: () => createRequest("secrets:clear", {}),
  },
  http: {
    get: (url, params = undefined, options = undefined) =>
      createRequest("http:get", { url, params, options }),
    post: (url, body = undefined, options = undefined) =>
      createRequest("http:post", { url, body, options }),
  },
  logger: {
    trace: createLogger("trace"),
    debug: createLogger("debug"),
    info: createLogger("info"),
    warn: createLogger("warn"),
    error: createLogger("error"),
  },
  sdk: createPluginSdkRuntime(),
};

let pluginInstancePromise = null;

async function loadPluginInstance() {
  if (!pluginInstancePromise) {
    pluginInstancePromise = import(workerData.entryUrl)
      .then((module) => module.default ?? module.plugin ?? module)
      .then((definition) => {
        if (!definition || typeof definition.create !== "function") {
          throw new Error("Plugin module must export a default object with a create() function");
        }

        return definition.create(pluginContext);
      });
  }

  return pluginInstancePromise;
}

loadPluginInstance()
  .then(() => {
    parentPort.postMessage({ type: "ready" });
  })
  .catch((error) => {
    parentPort.postMessage({ type: "init-error", payload: serializeError(error) });
  });

parentPort.on("message", async (message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "response") {
    const pendingRequest = pendingRequests.get(message.requestId);
    if (!pendingRequest) {
      return;
    }

    pendingRequests.delete(message.requestId);

    if (message.ok) {
      pendingRequest.resolve(message.result);
      return;
    }

    pendingRequest.reject(new Error(message.error?.message ?? "Plugin host request failed"));
    return;
  }

  if (message.type === "dispose") {
    try {
      const instance = await loadPluginInstance();
      await instance?.dispose?.();
    } finally {
      process.exit(0);
    }
    return;
  }

  if (message.type !== "call") {
    return;
  }

  try {
    const instance = await loadPluginInstance();
    const handler = instance?.[message.method];

    if (typeof handler !== "function") {
      throw new Error(`Plugin method not available: ${String(message.method)}`);
    }

    const result = await handler(message.payload);
    parentPort.postMessage({
      type: "call-result",
      requestId: message.requestId,
      result,
    });
  } catch (error) {
    parentPort.postMessage({
      type: "call-error",
      requestId: message.requestId,
      error: serializeError(error),
    });
  }
});
