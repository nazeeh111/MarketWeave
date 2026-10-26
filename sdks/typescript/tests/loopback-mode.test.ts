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

import { Polymarket } from "../pmxt/client";
import { ServerManager } from "../pmxt/server-manager";
import { ENV } from "../pmxt/constants";

class ProbeClient extends Polymarket {
  ready() { return this.initPromise; }
  target() { return this.resolveBaseUrl(); }
}

describe("explicit sidecar target ownership", () => {
  beforeEach(() => {
    delete process.env[ENV.BASE_URL];
    delete process.env[ENV.API_KEY];
  });
  afterEach(() => jest.restoreAllMocks());

  test.each([false, true])("does not start or redirect explicit target (env=%s)", async (fromEnvironment) => {
    const ensure = jest.spyOn(ServerManager.prototype, "ensureServerRunning").mockResolvedValue();
    const port = jest.spyOn(ServerManager.prototype, "getRunningPort").mockReturnValue(3847);
    const target = "http://127.0.0.1:49152";
    if (fromEnvironment) process.env[ENV.BASE_URL] = target;
    const client = new ProbeClient(fromEnvironment ? {} : { baseUrl: target });
    await client.ready();
    expect(client.target()).toBe(target);
    expect(ensure).not.toHaveBeenCalled();
    expect(port).not.toHaveBeenCalled();
  });

  test("implicit default still starts and follows its owned sidecar", async () => {
    const ensure = jest.spyOn(ServerManager.prototype, "ensureServerRunning").mockResolvedValue();
    jest.spyOn(ServerManager.prototype, "getRunningPort").mockReturnValue(3848);
    const client = new ProbeClient();
    await client.ready();
    expect(client.target()).toBe("http://localhost:3848");
    expect(ensure).toHaveBeenCalledTimes(1);
  });
});
