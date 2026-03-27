"use strict";
/**
 * 依赖注入使用示例
 *
 * 本项目提供了三种依赖注入方式：
 * 1. 直接 getService() - 最简单，适合快速开发
 * 2. @inject 装饰器 - 适合类组件
 * 3. Injector 自动注入 - 最灵活，适合复杂场景
 */
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    /**
 * Validate that a value is a function (or undefined) and return it.
 * @param {*} f - The value to validate; may be a function or `undefined`.
 * @returns {Function|undefined} The provided function, or `undefined` if none was provided.
 * @throws {TypeError} If `f` is provided and is not a function.
 */
function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    /**
 * Ensures the given value is an instance of the Promise-like constructor `P`.
 * @param {*} value - The value to adopt.
 * @returns {*} `value` if it is an instance of `P`, otherwise a new `P` that resolves to `value`.
 */
function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        /**
 * Advance the wrapped generator by passing it a fulfilled value and reject if the generator throws.
 * @param {*} value - The value to send into `generator.next`.
 */
function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        /**
 * Injects a thrown value into the active generator and advances its execution; if advancing throws synchronously, forwards that exception to the rejection callback.
 * @param {*} value - The value or error to throw into the generator.
 */
function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        /**
 * Process a generator result: resolve with its value if finished, otherwise adopt the yielded value and attach continuation handlers.
 * @param {{ done: boolean, value: any }} result - The iterator result object with `done` indicating completion and `value` being the yielded or return value.
 */
function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    /**
 * Create a function that invokes `step` using a fixed verb code and a provided value.
 * @param {number} n - The verb code to pair with the value when calling `step`.
 * @returns {function(*): *} A function that takes a value `v` and returns the result of calling `step([n, v])`.
 */
function verb(n) { return function (v) { return step([n, v]); }; }
    /**
     * Advances the internal state machine for a compiled generator, performing the requested operation and returning the resulting iterator record.
     *
     * @param {Array} op - Operation tuple where the first element is the opcode and the second is an optional value/argument for the operation.
     * @returns {{value: any, done: boolean}} An iterator result object reflecting the generator's yielded value (if any) and completion state.
     * @throws {TypeError} If the generator is re-entered while already executing.
     */
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
exports.MockLoggerService = exports.MockApiService = exports.DownloadManager = exports.CacheService = exports.DownloadService = exports.AnnotatedPlayerService = exports.PlayerService = exports.DecoratedService = exports.SimpleService = void 0;
exports.demonstrateDI = demonstrateDI;
var registry_1 = require("./registry");
var decorators_1 = require("./decorators");
var injector_1 = require("./injector");
// ==================== 方式 1: 直接 getService ====================
// 最简单直接，适合快速开发
var SimpleService = /** @class */ (function () {
    /**
     * Simple service that acquires the shared API and logger services from the registry.
     *
     * @constructor
     * @property {any} api - The resolved API service instance.
     * @property {any} logger - The resolved logger service instance.
     */
    function SimpleService() {
        this.api = (0, registry_1.getService)('api');
        this.logger = (0, registry_1.getService)('logger');
    }
    SimpleService.prototype.fetchData = function (id) {
        this.logger.info('SimpleService', "Fetching data for ".concat(id));
        this.api.request('netease', '/song/detail', { ids: id });
    };
    return SimpleService;
}());
exports.SimpleService = SimpleService;
var _simpleExample = new SimpleService();
// ==================== 方式 2: 使用装饰器 @inject ====================
// 适合 Vue 组件和需要明确依赖的类
var DecoratedService = function () {
    var _a;
    var _api_decorators;
    var _api_initializers = [];
    var _api_extraInitializers = [];
    var _logger_decorators;
    var _logger_initializers = [];
    var _logger_extraInitializers = [];
    return _a = /** @class */ (function () {
            /**
             * Service that receives its `api` and `logger` dependencies via field decorators.
             *
             * @constructor
             * @property {any} api - Injected API service used to make HTTP requests.
             * @property {any} logger - Injected logger used for informational and debug messages.
             */
            function DecoratedService() {
                this.api = __runInitializers(this, _api_initializers, void 0);
                this.logger = (__runInitializers(this, _api_extraInitializers), __runInitializers(this, _logger_initializers, void 0));
                __runInitializers(this, _logger_extraInitializers);
            }
            DecoratedService.prototype.fetchData = function (id) {
                this.logger.info('DecoratedService', "Fetching data for ".concat(id));
                this.api.request('netease', '/song/detail', { ids: id });
            };
            return DecoratedService;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _api_decorators = [(0, decorators_1.inject)(IApiService)];
            _logger_decorators = [(0, decorators_1.inject)(ILoggerService)];
            __esDecorate(null, null, _api_decorators, { kind: "field", name: "api", static: false, private: false, access: { has: function (obj) { return "api" in obj; }, get: function (obj) { return obj.api; }, set: function (obj, value) { obj.api = value; } }, metadata: _metadata }, _api_initializers, _api_extraInitializers);
            __esDecorate(null, null, _logger_decorators, { kind: "field", name: "logger", static: false, private: false, access: { has: function (obj) { return "logger" in obj; }, get: function (obj) { return obj.logger; }, set: function (obj, value) { obj.logger = value; } }, metadata: _metadata }, _logger_initializers, _logger_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.DecoratedService = DecoratedService;
var _decoratedExample = new DecoratedService();
// Vue 组件示例
/*
import { defineComponent } from 'vue'

export default defineComponent({
  setup() {
    const api = useService(IApiService)
    const logger = useService(ILoggerService)

    const fetchData = (id: string) => {
      logger.info('Component', `Fetching ${id}`)
      return api.request('netease', '/song/detail', { ids: id })
    }

    return { fetchData }
  }
})
*/
// ==================== 方式 3: Injector 自动注入 ====================
// 最灵活，支持构造函数注入和单例模式
/**
 * 使用构造函数的类
 * 参数默认值使用 getService() 获取服务
 */
var PlayerService = /** @class */ (function () {
    /**
     * Constructor for PlayerService that assigns API and logger dependencies.
     * @constructor
     * @param {any} [api] - API service used to make requests; defaults to the service registered as `'api'`.
     * @param {any} [logger] - Logger service used for logging; defaults to the service registered as `'logger'`.
     */
    function PlayerService(api, logger) {
        if (api === void 0) { api = (0, registry_1.getService)('api'); }
        if (logger === void 0) { logger = (0, registry_1.getService)('logger'); }
        this.api = api;
        this.logger = logger;
    }
    PlayerService.prototype.playSong = function (songId) {
        this.logger.info('PlayerService', "Playing song ".concat(songId));
        this.api.request('netease', '/song/url/v1', { id: songId });
    };
    return PlayerService;
}());
exports.PlayerService = PlayerService;
var _playerExample = new PlayerService();
/**
 * 使用 @Inject 注解的类
 * 类型更安全，依赖关系更明确
 */
var AnnotatedPlayerService = /** @class */ (function () {
    /**
     * Player service constructed with explicit `api` and `logger` dependencies used to play songs.
     * @param {object} api - API service implementing `request(service, endpoint, params)` to fetch song data.
     * @param {object} logger - Logger service exposing `info`, `warn`, `error`, and `debug` methods for logging.
     */
    function AnnotatedPlayerService(api, logger) {
        this.api = api;
        this.logger = logger;
    }
    AnnotatedPlayerService.prototype.playSong = function (songId) {
        this.logger.info('AnnotatedPlayerService', "Playing song ".concat(songId));
        this.api.request('netease', '/song/url/v1', { id: songId });
    };
    return AnnotatedPlayerService;
}());
exports.AnnotatedPlayerService = AnnotatedPlayerService;
/**
 * Demonstrates three dependency-injection patterns (direct service lookup, decorator field injection, and constructor/Injector-based injection) by instantiating example services and exercising their methods, including verifying Injector singleton behavior.
 */
function demonstrateDI() {
    // 方式 1: 直接实例化（依赖在内部获取）
    var simple = new SimpleService();
    simple.fetchData('123');
    // 方式 2: 装饰器方式（需要 TypeScript 启用 experimentalDecorators）
    var decorated = new DecoratedService();
    decorated.fetchData('456');
    // 方式 3a: 使用 Injector 自动解析
    var injector = new injector_1.Injector();
    var player1 = injector.createInstance(PlayerService);
    player1.playSong('789');
    // 方式 3b: 使用 Injector + 单例模式
    var player2 = injector.createInstance(PlayerService, { singleton: true });
    var player3 = injector.createInstance(PlayerService, { singleton: true });
    console.log(player2 === player3); // true，同一个实例
    // 方式 3c: 使用 AnnotatedInjector + @Inject 注解
    var annotatedPlayer = (0, injector_1.createAnnotatedInstance)(AnnotatedPlayerService);
    annotatedPlayer.playSong('012');
    // 便捷函数方式
    var player4 = (0, injector_1.createInstance)(PlayerService);
    player4.playSong('345');
}
// ==================== 高级用法：服务依赖其他服务 ====================
/**
 * 下载服务依赖 API 服务和日志服务
 */
var DownloadService = /** @class */ (function () {
    /**
     * Creates a DownloadService that performs song downloads using the provided API and logs progress.
     * @param {object} api - Service exposing a `request(service, endpoint, params)` method for HTTP calls.
     * @param {object} logger - Logger implementing methods such as `info`, `warn`, `error`, and `debug`.
     */
    function DownloadService(api, logger) {
        this.api = api;
        this.logger = logger;
    }
    DownloadService.prototype.downloadSong = function (songId) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.logger.info('DownloadService', "Downloading song ".concat(songId));
                        return [4 /*yield*/, this.api.request('netease', '/song/url/v1', {
                                id: songId,
                                level: 'standard'
                            })];
                    case 1:
                        response = _b.sent();
                        return [2 /*return*/, ((_a = response.data) === null || _a === void 0 ? void 0 : _a.url) || ''];
                }
            });
        });
    };
    return DownloadService;
}());
exports.DownloadService = DownloadService;
/**
 * 缓存服务依赖日志服务
 */
var CacheService = /** @class */ (function () {
    /**
     * Provides simple key/value caching backed by localStorage and emits debug messages via the supplied logger.
     * @param {{debug: function(string, string):void}} logger - Logger used for debug output; should implement a `debug(module, message)` method.
     */
    function CacheService(logger) {
        this.logger = logger;
    }
    CacheService.prototype.get = function (key) {
        this.logger.debug('CacheService', "Getting cache key: ".concat(key));
        return localStorage.getItem(key);
    };
    CacheService.prototype.set = function (key, value) {
        this.logger.debug('CacheService', "Setting cache key: ".concat(key));
        localStorage.setItem(key, value);
    };
    return CacheService;
}());
exports.CacheService = CacheService;
/**
 * 复杂场景：多层依赖
 * DownloadManager 依赖 DownloadService 和 CacheService
 */
var DownloadManager = /** @class */ (function () {
    /**
     * Creates a download manager that retrieves song URLs, caches results, and logs operations.
     * @param {object} logger - Logger implementing info/warn/error/debug used for operational messages.
     * @param {DownloadService} [downloadService] - Service that performs song downloads; defaults to an annotated DownloadService instance when omitted.
     * @param {CacheService} [cacheService] - Service that stores and retrieves cached values; defaults to an annotated CacheService instance when omitted.
     */
    function DownloadManager(logger, downloadService, cacheService) {
        if (downloadService === void 0) { downloadService = (0, injector_1.createAnnotatedInstance)(DownloadService); }
        if (cacheService === void 0) { cacheService = (0, injector_1.createAnnotatedInstance)(CacheService); }
        this.logger = logger;
        this.downloadService = downloadService;
        this.cacheService = cacheService;
    }
    DownloadManager.prototype.downloadWithCache = function (songId) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, url;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cached = this.cacheService.get("song:".concat(songId));
                        if (cached) {
                            this.logger.info('DownloadManager', "Cache hit for ".concat(songId));
                            return [2 /*return*/, cached];
                        }
                        // 缓存未命中，下载并缓存
                        this.logger.info('DownloadManager', "Cache miss for ".concat(songId, ", downloading..."));
                        return [4 /*yield*/, this.downloadService.downloadSong(songId)];
                    case 1:
                        url = _a.sent();
                        this.cacheService.set("song:".concat(songId), url);
                        return [2 /*return*/, url];
                }
            });
        });
    };
    return DownloadManager;
}());
exports.DownloadManager = DownloadManager;
// ==================== 测试用例：Mock 依赖 ====================
/**
 * Mock API 服务用于测试
 */
var MockApiService = /** @class */ (function () {
    /**
     * Mock API service for tests and examples that simulates network requests.
     *
     * Instances provide a `request(service, endpoint, params)` method which logs the call
     * to the console prefixed with `[MockAPI]` and returns a Promise resolving to
     * an object shaped like `{ data: { url: 'mock-url' } }`.
     * @constructor
     */
    function MockApiService() {
    }
    MockApiService.prototype.request = function (service, endpoint, params) {
        console.log("[MockAPI] ".concat(service).concat(endpoint), params);
        return Promise.resolve({ data: { url: 'mock-url' } });
    };
    return MockApiService;
}());
exports.MockApiService = MockApiService;
/**
 * Mock 日志服务用于测试
 */
var MockLoggerService = /** @class */ (function () {
    /**
     * Lightweight logger implementation that forwards `info`, `warn`, `error`, and `debug` calls to the browser console.
     *
     * Provides the logging methods expected by consumer services and test doubles; each method delegates to the corresponding `console` method.
     * @constructor
     */
    function MockLoggerService() {
    }
    MockLoggerService.prototype.info = function (module, message) {
        console.log("[MockLogger][".concat(module, "] ").concat(message));
    };
    MockLoggerService.prototype.warn = function (module, message) {
        console.warn("[MockLogger][".concat(module, "] ").concat(message));
    };
    MockLoggerService.prototype.error = function (module, message) {
        console.error("[MockLogger][".concat(module, "] ").concat(message));
    };
    MockLoggerService.prototype.debug = function (module, message) {
        console.debug("[MockLogger][".concat(module, "] ").concat(message));
    };
    return MockLoggerService;
}());
exports.MockLoggerService = MockLoggerService;
// ==================== 总结 ====================
/**
 * 依赖注入方式选择建议：
 *
 * 1. **快速开发/小项目**: 直接 getService()
 *    - 优点：简单直接，代码量少
 *    - 缺点：依赖关系不明显，测试时需要手动 Mock
 *
 * 2. **Vue 组件/中等项目**: @inject 装饰器 + useService()
 *    - 优点：依赖关系清晰，易于测试
 *    - 缺点：需要 TypeScript 启用 experimentalDecorators
 *
 * 3. **复杂服务/大型项目**: Injector + 构造函数注入
 *    - 优点：依赖完全显式，支持单例/瞬态作用域，易于测试和维护
 *    - 缺点：代码量稍多，需要理解 DI 概念
 *
 * 推荐：新代码优先使用 Injector + 构造函数注入方式
 */
