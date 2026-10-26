import { Polymarket } from "../pmxt/client";
import { ServerManager } from "../pmxt/server-manager";
import { ENV } from "../pmxt/constants";

class ProbeClient extends Polymarket {
  headers() { return this.getAuthHeaders(); }
}

beforeEach(() => {
  delete process.env[ENV.BASE_URL];
  delete process.env[ENV.API_KEY];
  jest.spyOn(ServerManager.prototype as any, "getServerInfo").mockReturnValue({
    port: 3847, pid: 1, timestamp: 0, accessToken: "synthetic-sidecar-token",
  });
});
afterEach(() => jest.restoreAllMocks());

test.each([
  "https://foreign.example.test", "http://localhost.example.test:3847",
  "http://127.0.0.1:49152", "https://localhost:3847",
])("does not attach global lock token to %s", (target) => {
  const client = new ProbeClient({ baseUrl: target, autoStartServer: false });
  expect(client.headers()["x-pmxt-access-token"]).toBeUndefined();
});

test.each([undefined, "http://127.0.0.1:3847"])("owned sidecar auth remains intact (%s)", (target) => {
  const client = new ProbeClient({ baseUrl: target, autoStartServer: false });
  expect(client.headers()["x-pmxt-access-token"]).toBe("synthetic-sidecar-token");
});

test("hosted bearer remains intact without reading the global lock", () => {
  const lock = jest.spyOn(ServerManager.prototype as any, "getServerInfo");
  const client = new ProbeClient({ baseUrl: "https://foreign.example.test", autoStartServer: false,
                                  pmxtApiKey: "synthetic-hosted-token" });
  expect(client.headers().Authorization).toBe("Bearer synthetic-hosted-token");
  expect(client.headers()["x-pmxt-access-token"]).toBeUndefined();
  expect(lock).not.toHaveBeenCalled();
});

test.each([
  ["ws://foreign.example.test/ws", undefined],
  ["ws://127.0.0.1:49152/ws", undefined],
  ["wss://localhost:3847/ws", undefined],
  ["ws://127.0.0.1:3847/ws", "synthetic-sidecar-token"],
])("WebSocket token admission checks actual endpoint %s", (target, expected) => {
  const manager = new ServerManager();
  const tokenFor = manager.getAccessToken.bind(manager) as (url?: string) => string | undefined;
  expect(tokenFor(target)).toBe(expected);
});

test("request does not send a new port's token to its old target", async () => {
  jest.spyOn(ServerManager.prototype as any, "getServerInfo")
    .mockReturnValueOnce({ port: 3847, accessToken: "synthetic-old" })
    .mockReturnValue({ port: 3848, accessToken: "synthetic-new" });
  const wire = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response('{"success":true,"data":[]}', { status: 200 }));
  const client = new ProbeClient({ autoStartServer: false });
  expect(await client.fetchMarkets({ limit: 1 })).toEqual([]);
  expect(String(wire.mock.calls[0][0])).toMatch(/^http:\/\/localhost:3847\//);
  const headers = new Headers(wire.mock.calls[0][1]?.headers);
  expect(headers.has("x-pmxt-access-token")).toBe(false);
});
