import { LimitlessWebSocket } from '../../src/exchanges/limitless/websocket';

jest.mock('@limitless-exchange/sdk', () => ({
    WebSocketClient: class {
        handlers = new Map<string, (...args: any[]) => void>();
        isConnected() { return true; }
        async subscribe() {}
        async disconnect() {}
        on(name: string, callback: (...args: any[]) => void) { this.handlers.set(name, callback); }
        emit(name: string, value: any) { this.handlers.get(name)?.(value); }
    },
}));
jest.mock('../../src/subscriber/external/goldsky', () => ({ GoldSkySubscriber: class {} }));
jest.mock('../../src/subscriber/watcher', () => ({ AddressWatcher: class { close() {} } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info() {}, warn() {}, error() {} } }));

async function flush() {
    for (let i = 0; i < 16; i++) await Promise.resolve();
}

for (const winner of ['update', 'close'] as const) {
    it(`clears the unused REST fallback timer when ${winner} settles a watch`, async () => {
        jest.useFakeTimers();
        const snapshot = jest.fn().mockResolvedValue({ bids: [], asks: [], timestamp: 1 });
        const watcher = new LimitlessWebSocket(async () => undefined, { fetchOrderBook: snapshot });
        try {
            // The initial snapshot is unchanged; the next call waits for an update.
            await watcher.watchOrderBook('synthetic');
            const pending = watcher.watchOrderBook('synthetic').catch(error => error.message);
            await flush();
            if (winner === 'update') {
                (watcher.getClient() as any).emit('orderbookUpdate', {
                    marketSlug: 'synthetic', orderbook: { bids: [], asks: [], timestamp: 2 },
                });
                expect(await pending).toEqual({ bids: [], asks: [], timestamp: 2 });
            } else {
                await watcher.close();
                expect(await pending).toBe('WebSocket closed');
            }
            expect(jest.getTimerCount()).toBe(0);
            await jest.advanceTimersByTimeAsync(3000);
            expect(snapshot).toHaveBeenCalledTimes(1);
        } finally {
            await watcher.close();
            jest.useRealTimers();
        }
    });
}
