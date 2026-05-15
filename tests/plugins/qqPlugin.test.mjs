import { describe, expect, it, vi } from "vitest";
import qqPlugin from "../../plugins/third-party/qq/index.mjs";

function createLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function createAdapter(httpGet) {
  const ctx = {
    platformId: "qq",
    settings: {
      apiBase: "http://127.0.0.1:3200",
      verboseLog: false,
    },
    http: {
      get: httpGet,
    },
    logger: createLogger(),
  };

  return {
    adapter: await qqPlugin.create(ctx),
  };
}

function createQQSong(overrides = {}) {
  return {
    mid: "002NWZkm4a6W1h",
    name: "反方向的钟",
    singer: [{ mid: "0025NhlN2yWrP4", name: "周杰伦" }],
    album: { mid: "000f01724fd7TH", name: "Jay" },
    interval: 258,
    file: { media_mid: "00400jk23JDWwJ" },
    ...overrides,
  };
}

describe("QQ external plugin", () => {
  it("unwraps object-wrapped QQ search responses", async () => {
    const httpGet = vi.fn().mockResolvedValue({
      response: {
        code: 0,
        song: {
          list: [createQQSong()],
          totalnum: 42,
        },
      },
    });
    const { adapter } = await createAdapter(httpGet);

    const result = await adapter.search({ keyword: "周杰伦", limit: 10, page: 1 });

    expect(result.total).toBe(42);
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: "002NWZkm4a6W1h",
      name: "反方向的钟",
      platform: "qq",
      extra: {
        mediaId: "00400jk23JDWwJ",
      },
    });

    const requestedUrl = new URL(httpGet.mock.calls[0][0]);
    expect(requestedUrl.pathname).toBe("/getSearchByKey");
    expect(requestedUrl.searchParams.get("key")).toBe("周杰伦");
    expect(requestedUrl.searchParams.get("limit")).toBe("10");
  });

  it("unwraps string-wrapped QQ search responses", async () => {
    const httpGet = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        code: 0,
        song: {
          list: [createQQSong({ mid: "003OUlho2HcRHC", name: "晴天" })],
          totalnum: 7,
        },
      }),
    });
    const { adapter } = await createAdapter(httpGet);

    const result = await adapter.search({ keyword: "晴天", limit: 20, page: 1 });

    expect(result.total).toBe(7);
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: "003OUlho2HcRHC",
      name: "晴天",
    });
  });

  it("unwraps QQ detail and play-url responses before resolving a song url", async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({
        response: {
          code: 0,
          track_info: {
            mid: "002NWZkm4a6W1h",
            strMediaMid: "00400jk23JDWwJ",
          },
        },
      })
      .mockResolvedValueOnce({
        response: {
          code: 0,
          playUrl: {
            "002NWZkm4a6W1h": {
              url: "https://dl.stream.qqmusic.qq.com/test.mp3",
            },
          },
        },
      });
    const { adapter } = await createAdapter(httpGet);

    await expect(adapter.getSongUrl({ id: "002NWZkm4a6W1h" })).resolves.toBe(
      "https://dl.stream.qqmusic.qq.com/test.mp3",
    );
  });
});
