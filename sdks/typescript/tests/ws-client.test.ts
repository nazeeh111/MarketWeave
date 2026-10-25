import { SidecarWsClient } from '../pmxt/ws-client';

describe('SidecarWsClient', () => {
  it('queues repeated data events instead of overwriting the latest event', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-firehose';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'c', data: { sequence: 3 } });

    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 1 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 3 });
  });

  it('resolves a pending waiter and queues later events in order', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-pending';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    const first = client.waitForData(requestId, 100);
    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });

    await expect(first).resolves.toEqual({ sequence: 1 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
  });

  it('clears queued events when closed', () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-close';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });

    expect(client.dataQueues.get(requestId)).toHaveLength(2);
    client.close();
    expect(client.dataQueues.has(requestId)).toBe(false);
    expect(client.dataStore.size).toBe(0);
  });

  it('honors maxReconnectAttempts and reconnectInterval from websocket config', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847', undefined, 'token', {
      maxReconnectAttempts: 2,
      reconnectInterval: 1,
    });
    let attempts = 0;
    client.connect = () => {
      attempts += 1;
      return Promise.reject(new Error('boom'));
    };

    await expect(client.ensureConnected()).rejects.toThrow();
    expect(attempts).toBe(2);
  });

  it('defaults to 3 connection attempts when no websocket config is provided', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847', undefined, 'token', {
      reconnectInterval: 1,
    });
    let attempts = 0;
    client.connect = () => {
      attempts += 1;
      return Promise.reject(new Error('boom'));
    };

    await expect(client.ensureConnected()).rejects.toThrow();
    expect(attempts).toBe(3);
  });

  it('uses a custom wsUrl from config and appends the auth token with the right separator', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847', 'tok', 'token', {
      wsUrl: 'wss://custom.example.com/ws?x=1',
      pingInterval: 0,
    });
    let capturedUrl = '';
    class FakeWs {
      onopen: any;
      onerror: any;
      onclose: any;
      onmessage: any;
      readyState = 1;
      constructor(url: string) {
        capturedUrl = url;
        setTimeout(() => this.onopen && this.onopen(), 0);
      }
      close() {}
    }
    client.getWebSocketConstructor = () => FakeWs;

    await client.ensureConnected();
    expect(capturedUrl).toBe('wss://custom.example.com/ws?x=1&token=tok');
    client.close();
  });

  it('drops the oldest queued events after the per-subscription cap', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-overflow';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    for (let sequence = 1; sequence <= 100_001; sequence += 1) {
      client.dispatch({
        event: 'data',
        id: requestId,
        symbol: String(sequence),
        data: { sequence },
      });
    }

    expect(client.dataQueues.get(requestId)).toHaveLength(100_000);
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 3 });
  });

  it('reuses an identical batch subscription for subsequent data', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const sent: any[] = [];
    client.ensureConnected = async () => {};
    client.ws = { send: (raw: string) => sent.push(JSON.parse(raw)), close() {} };

    const first = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
    await new Promise(resolve => setTimeout(resolve, 0));
    client.dispatch({ event: 'data', id: sent[0].id, symbol: 'A', data: { sequence: 1 } });
    await expect(first).resolves.toEqual({ A: { sequence: 1 } });

    const second = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
    await new Promise(resolve => setTimeout(resolve, 0));
    // Dispatch to the active stream, even if a broken client sent a duplicate request.
    for (const message of sent) {
      client.dispatch({ event: 'data', id: message.id, symbol: 'A', data: { sequence: 2 } });
    }
    await expect(second).resolves.toEqual({ A: { sequence: 2 } });
    expect(sent).toHaveLength(1);
    client.close();
  });

  it('keeps batch subscriptions distinct when depth, exchange or method changes', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const sent: any[] = [];
    client.ensureConnected = async () => {};
    client.ws = { send: (raw: string) => sent.push(JSON.parse(raw)), close() {} };
    const calls: [string, string, any[]][] = [
      ['synthetic', 'watchOrderBooks', [['A'], 5]],
      ['synthetic', 'watchOrderBooks', [['A'], 10]],
      ['other', 'watchOrderBooks', [['A'], 10]],
      ['other', 'otherWatch', [['A'], 10]],
    ];

    for (const [exchange, method, args] of calls) {
      const result = client.subscribeBatch(exchange, method, args);
      await new Promise(resolve => setTimeout(resolve, 0));
      const message = sent[sent.length - 1];
      client.dispatch({ event: 'data', id: message.id, symbol: 'A', data: { sequence: sent.length } });
      await result;
    }
    expect(sent).toHaveLength(4);
    expect(new Set(sent.map(message => message.id)).size).toBe(4);
    client.close();
  });

  it('creates a new batch request after remote close, explicit close or transport error', async () => {
    for (const mode of ['remote', 'explicit', 'error']) {
      const client: any = new SidecarWsClient('http://localhost:3847', undefined, 'token', {
        pingInterval: 0,
      });
      const sockets: any[] = [];
      class FakeWs {
        onopen: any;
        onclose: any;
        onerror: any;
        sent: any[] = [];
        constructor() {
          sockets.push(this);
          setTimeout(() => this.onopen(), 0);
        }
        send(raw: string) { this.sent.push(JSON.parse(raw)); }
        close() { this.onclose(); }
      }
      client.getWebSocketConstructor = () => FakeWs;
      const first = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
      await new Promise(resolve => setTimeout(resolve, 0));
      client.dispatch({ event: 'data', id: sockets[0].sent[0].id, symbol: 'A', data: { sequence: 1 } });
      await first;
      if (mode === 'remote') sockets[0].close();
      else if (mode === 'explicit') client.close();
      else sockets[0].onerror({ message: 'synthetic transport error' });

      const second = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
      await new Promise(resolve => setTimeout(resolve, 0));
      // Settle even a stale request before asserting the fresh socket received a subscribe.
      for (const sub of client.subscriptions.values()) {
        client.dispatch({ event: 'data', id: sub.requestId, symbol: 'A', data: { sequence: 2 } });
      }
      await expect(second).resolves.toEqual({ A: { sequence: 2 } });
      client.close();
      expect(sockets).toHaveLength(2);
      expect(sockets[1].sent).toHaveLength(1);
    }
  });

  it('sends a fresh batch request after server rejection with or without a waiter', async () => {
    for (const afterData of [false, true]) {
      const client: any = new SidecarWsClient('http://localhost:3847');
      const sent: any[] = [];
      client.ensureConnected = async () => {};
      client.ws = { send: (raw: string) => sent.push(JSON.parse(raw)), close() {} };
      const first = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (afterData) {
        client.dispatch({ event: 'data', id: sent[0].id, symbol: 'A', data: { sequence: 1 } });
        await first;
      }
      client.dispatch({ event: 'error', id: sent[0].id, error: { message: 'Synthetic refusal' } });
      if (!afterData) await expect(first).rejects.toThrow();

      const second = client.subscribeBatch('synthetic', 'watchOrderBooks', [['A']]);
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const message of sent) {
        client.dispatch({ event: 'data', id: message.id, symbol: 'A', data: { sequence: 2 } });
      }
      await expect(second).resolves.toEqual({ A: { sequence: 2 } });
      client.close();
      expect(sent).toHaveLength(2);
    }
  });
});
