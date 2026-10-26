import { resolvePmxtBaseUrl } from "../pmxt/constants";

describe("local sidecar URL aliases and fallback ports", () => {
  test.each([
    "http://localhost:3847", "http://localhost:3848",
    "http://127.0.0.1:49152", "http://[::1]:49152/",
    "http://localhost:3847/", "https://localhost:4443",
  ])("keeps %s in sidecar mode for arguments and environment", (url) => {
    for (const args of [{ baseUrl: url, env: {} }, { env: { PMXT_BASE_URL: url } }]) {
      const result = resolvePmxtBaseUrl(args);
      expect(result.baseUrl).toBe(url);
      expect(result.isHosted).toBe(false);
    }
  });

  test.each([
    "https://api.pmxt.dev", "https://proxy.example.test",
    "http://localhost.example.test:3847", "http://127.0.0.1.example.test:3847",
    "http://localhost:3847/hosted", "http://localhost:3847?route=hosted",
    "http://localhost:65536", "file://localhost/",
  ])("preserves hosted mode for %s", (url) => {
    expect(resolvePmxtBaseUrl({ baseUrl: url, env: {} }).isHosted).toBe(true);
  });
});
