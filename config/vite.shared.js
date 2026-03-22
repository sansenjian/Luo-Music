"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.electronRendererManualChunks = exports.webManualChunks = void 0;
exports.createSrcAlias = createSrcAlias;
exports.createSharedDevProxy = createSharedDevProxy;
var node_path_1 = require("node:path");
function createSrcAlias(rootDir) {
    return {
        '@': (0, node_path_1.resolve)(rootDir, 'src')
    };
}
function createSharedDevProxy(options) {
    if (options === void 0) { options = {}; }
    var qqProxy = {
        target: 'http://localhost:3200',
        changeOrigin: true,
        secure: false,
        rewrite: function (path) { return path.replace(/^\/qq-api/, ''); }
    };
    if (options.withQqTimeout) {
        qqProxy.proxyTimeout = 15000;
        qqProxy.timeout = 15000;
    }
    return {
        '/api': {
            target: 'http://localhost:14532',
            changeOrigin: true,
            rewrite: function (path) { return path.replace(/^\/api/, ''); }
        },
        '/qq-api': qqProxy
    };
}
var webManualChunks = function (id) {
    if (!id.includes('node_modules')) {
        return undefined;
    }
    if (id.includes('@tanstack/')) {
        return 'vendor-query';
    }
    if (id.includes('@vercel/analytics')) {
        return 'vendor-analytics';
    }
    if (id.includes('vue') || id.includes('pinia') || id.includes('router')) {
        return 'vendor-core';
    }
    if (id.includes('pinia-plugin-persistedstate')) {
        return 'vendor-core';
    }
    if (id.includes('axios') || id.includes('animejs')) {
        return 'vendor-utils';
    }
    return 'vendor-libs';
};
exports.webManualChunks = webManualChunks;
var electronRendererManualChunks = function (id) {
    if (!id.includes('node_modules')) {
        return undefined;
    }
    if (id.includes('/vue/') ||
        id.includes('/@vue/') ||
        id.includes('/pinia/') ||
        id.includes('/vue-router/') ||
        id.includes('/@tanstack/vue-query/')) {
        return 'vendor-vue';
    }
    if (id.includes('/axios/') ||
        id.includes('/animejs/') ||
        id.includes('/zod/') ||
        id.includes('/date-fns/')) {
        return 'vendor-utils';
    }
    return undefined;
};
exports.electronRendererManualChunks = electronRendererManualChunks;
