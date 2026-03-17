"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = getCache;
exports.setCache = setCache;
exports.clearGatewayCache = clearGatewayCache;
exports.getGatewayCacheStatus = getGatewayCacheStatus;
exports.executeWithRetry = executeWithRetry;
var cache_1 = require("../../shared/protocol/cache");
var logger_1 = require("../../logger");
var CACHE_CONFIG = {
    TTL: cache_1.CACHE_DEFAULTS.TTL,
    MAX_SIZE: cache_1.CACHE_DEFAULTS.MAX_SIZE
};
var CACHEABLE_ENDPOINTS = new Set(cache_1.GATEWAY_CACHEABLE_ENDPOINTS);
var gatewayCache = new Map();
var RETRY_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 1000,
    MAX_DELAY: 10000,
    BACKOFF_MULTIPLIER: 2
};
function generateCacheKey(service, endpoint, params) {
    return "".concat(service, ":").concat(endpoint, ":").concat(JSON.stringify(params || {}));
}
function isCacheValid(cacheEntry) {
    var now = Date.now();
    return now - cacheEntry.timestamp < CACHE_CONFIG.TTL;
}
function getCache(service, endpoint, params) {
    if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
        return null;
    }
    var key = generateCacheKey(service, endpoint, params);
    var cacheEntry = gatewayCache.get(key);
    if (cacheEntry && isCacheValid(cacheEntry)) {
        cacheEntry.lastAccessed = Date.now();
        logger_1.default.info("[Gateway Cache] HIT: ".concat(key));
        return cacheEntry.data;
    }
    if (cacheEntry) {
        gatewayCache.delete(key);
    }
    return null;
}
function setCache(service, endpoint, params, data) {
    if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
        return;
    }
    var key = generateCacheKey(service, endpoint, params);
    if (gatewayCache.size >= CACHE_CONFIG.MAX_SIZE) {
        var oldestKey = null;
        var oldestTime = Date.now();
        for (var _i = 0, _a = gatewayCache.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], k = _b[0], v = _b[1];
            if (v.lastAccessed < oldestTime) {
                oldestTime = v.lastAccessed;
                oldestKey = k;
            }
        }
        if (oldestKey) {
            gatewayCache.delete(oldestKey);
        }
    }
    var now = Date.now();
    gatewayCache.set(key, {
        data: data,
        timestamp: now,
        lastAccessed: now
    });
    logger_1.default.info("[Gateway Cache] SET: ".concat(key));
}
function clearGatewayCache() {
    gatewayCache.clear();
    logger_1.default.info('[Gateway Cache] Cleared');
}
function getGatewayCacheStatus() {
    return {
        size: gatewayCache.size,
        maxSize: CACHE_CONFIG.MAX_SIZE,
        ttl: CACHE_CONFIG.TTL
    };
}
function calculateRetryDelay(retryCount) {
    var exponentialDelay = RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount - 1);
    var jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, RETRY_CONFIG.MAX_DELAY);
}
function shouldRetry(error, retryCount) {
    var _a, _b, _c;
    if (retryCount >= RETRY_CONFIG.MAX_RETRIES || !error) {
        return false;
    }
    var err = error;
    if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return false;
    }
    return (err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('Network Error')) ||
        ((_b = err.message) === null || _b === void 0 ? void 0 : _b.includes('timeout')) ||
        ((_c = err.message) === null || _c === void 0 ? void 0 : _c.includes('Service is not available')));
}
function delay(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function executeWithRetry(fn, context) {
    return __awaiter(this, void 0, void 0, function () {
        var lastError, retryCount, delayTime, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    retryCount = 0;
                    _a.label = 1;
                case 1:
                    if (!(retryCount <= RETRY_CONFIG.MAX_RETRIES)) return [3 /*break*/, 8];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    if (!(retryCount > 0)) return [3 /*break*/, 4];
                    delayTime = calculateRetryDelay(retryCount);
                    logger_1.default.warn("[Retry] ".concat(context, " - retry ").concat(retryCount, ", delay ").concat(Math.round(delayTime), "ms"));
                    return [4 /*yield*/, delay(delayTime)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [4 /*yield*/, fn()];
                case 5: return [2 /*return*/, _a.sent()];
                case 6:
                    error_1 = _a.sent();
                    lastError = error_1;
                    if (!shouldRetry(error_1, retryCount)) {
                        throw error_1;
                    }
                    if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
                        logger_1.default.error("[Retry] ".concat(context, " - failed after ").concat(RETRY_CONFIG.MAX_RETRIES, " retries"));
                        throw error_1;
                    }
                    logger_1.default.warn("[Retry] ".concat(context, " - will retry: ").concat(error_1.message));
                    return [3 /*break*/, 7];
                case 7:
                    retryCount++;
                    return [3 /*break*/, 1];
                case 8: throw lastError;
            }
        });
    });
}
