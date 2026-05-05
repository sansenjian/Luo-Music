/**
 * Re:Start Theme - third-party theme plugin.
 *
 * Theme resources are declared in manifest.json. The runtime only exists so the
 * plugin satisfies the external-host contract if the host ever loads it.
 */

export default {
  async create(ctx) {
    ctx.logger.info("Re:Start theme plugin initialized");

    return {
      async dispose() {
        ctx.logger.info("Re:Start theme plugin disposed");
      },
    };
  },
};
