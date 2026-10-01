import { AxiosError, AxiosInstance } from 'axios';
import { MarketFilterParams } from '../../src/BaseExchange';
import { PolymarketExchange } from '../../src/exchanges/polymarket';

// Literal public-catalog-shaped fixtures. Only transport is controlled: public
// wrapper, routing, serializer, raw filtering and normalizer remain real.
// These cases catch parent-scanning instead of token lookup, implicit closed
// defaults, synthetic 0/1 token matches, partial results and title/context loss.
const activeParent = { id: 'parent-open', slug: 'open-parent', title: 'Parent open', active: true, closed: false, tags: [{ label: 'Politics' }] };
const closedParent = { id: 'parent-closed', slug: 'closed-parent', title: 'Parent closed', active: false, closed: true, tags: [{ label: 'History' }] };
const baseMarket = { id: '700', slug: 'known-choice', question: 'Known choice?', active: false, closed: false, archived: false, outcomes: '["Yes","No"]', outcomePrices: '["0.25","0.75"]', clobTokenIds: '["7001","7002"]', endDate: '2030-01-01T00:00:00Z', volume24hr: 7 };

type Raw = Record<string, any>;
type Request = { path: string; params: Record<string, any>; serialized: string };
function fixtureExchange(open: unknown = [], closed: unknown = [], eventChildren: Raw[] = [], failClosed = false) {
    const exchange = new PolymarketExchange();
    const http = (exchange as unknown as { http: AxiosInstance }).http;
    const requests: Request[] = [];
    http.defaults.adapter = async config => {
        const path = new URL(config.url!).pathname;
        const params = config.params || {};
        const serializer = config.paramsSerializer as { serialize: (params: Record<string, any>) => string };
        requests.push({ path, params, serialized: serializer.serialize(params) });
        if (requests.length > 2 || config.method !== 'get') throw new Error('Two-request GET-only fixture guard');
        let data: unknown;
        if (path === '/markets' && params.clob_token_ids) {
            if (params.closed === true && failClosed) {
                throw new AxiosError('Controlled Gamma denial', 'ERR_BAD_RESPONSE', config, undefined, {
                    status: 403, statusText: 'Forbidden', headers: {}, config, data: { error: 'denied' },
                });
            }
            data = params.closed === true ? closed : open;
        } else if (path === '/markets' && params.id) data = eventChildren.map(m => ({ ...m, events: [activeParent] }));
        else if (path.startsWith('/markets/slug/')) data = { ...eventChildren[0], events: [activeParent] };
        else if (path === '/events') {
            // Legacy parent-aware discovery cannot find a token in a closed parent.
            data = params.active === 'true' ? [] : [{ ...closedParent, markets: eventChildren }];
            if (params.id) data = [{ ...activeParent, markets: eventChildren }];
        } else if (path === '/public-search') data = { events: [{ ...activeParent, markets: eventChildren }], pagination: { hasMore: false } };
        else throw new Error(`Unexpected fixture route ${path}`);
        return { status: 200, statusText: 'OK', headers: {}, config, data };
    };
    return { exchange, requests };
}

describe('Polymarket exact raw outcome lookup', () => {
    it.each([undefined, 'all'] as const)('status %p resolves open and closed markets without parent discovery', async status => {
        const { exchange, requests } = fixtureExchange(
            [{ ...baseMarket, events: [closedParent] }],
            [{ ...baseMarket, id: '701', closed: true, groupItemTitle: 'Candidate B', events: [activeParent] }],
        );
        const markets = await exchange.fetchMarkets({ outcomeId: '7001', ...(status === undefined ? {} : { status }) });
        expect(markets.map(m => m.id)).toEqual(['700', '701']);
        expect(markets.map(m => m.title)).toEqual(['Parent closed - Known choice?', 'Parent open - Known choice?']);
        expect(markets.map(m => m.outcomes.map(o => o.label))).toEqual([['Parent closed - Known choice?', 'Not Parent closed - Known choice?'], ['Candidate B', 'Not Candidate B']]);
        expect(markets[0]).toMatchObject({ eventId: 'parent-closed', url: 'https://polymarket.com/event/closed-parent', tags: ['History'], category: 'History' });
        expect(requests.map(r => ({ path: r.path, params: r.params }))).toEqual([
            { path: '/markets', params: { clob_token_ids: ['7001'], closed: false } },
            { path: '/markets', params: { clob_token_ids: ['7001'], closed: true } },
        ]);
        expect(requests.map(r => r.serialized)).toEqual(['clob_token_ids=7001&closed=false', 'clob_token_ids=7001&closed=true']);
    });

    it.each(['closed', 'inactive'] as const)('%s reads only the closed partition and includes archived closed children', async status => {
        const { exchange, requests } = fixtureExchange([], [{ ...baseMarket, closed: true, archived: true, events: [activeParent] }]);
        expect((await exchange.fetchMarkets({ outcomeId: '7002', status })).map(m => m.id)).toEqual(['700']);
        expect(requests).toHaveLength(1);
        expect(requests[0].params).toEqual({ clob_token_ids: ['7002'], closed: true });
    });

    it('active selects the open partition and filters raw inactive/closed/archived flags', async () => {
        const { exchange, requests } = fixtureExchange([
            { ...baseMarket, id: '704', active: true, events: [activeParent] },
            { ...baseMarket, id: '705', active: false },
            { ...baseMarket, id: '706', active: true, archived: true },
            { ...baseMarket, id: '707', active: true, closed: true },
        ]);
        expect((await exchange.fetchMarkets({ outcomeId: '7001', status: 'active' })).map(m => m.id)).toEqual(['704']);
        expect(requests).toHaveLength(1);
        expect(requests[0].params).toEqual({ clob_token_ids: ['7001'], closed: false });
    });

    it('deduplicates matching raw market IDs across partitions with first response context', async () => {
        const first = { ...baseMarket, events: [closedParent] };
        const { exchange } = fixtureExchange([first, first], [{ ...baseMarket, closed: true, events: [activeParent] }]);
        const markets = await exchange.fetchMarkets({ outcomeId: '7001' });
        expect(markets.map(m => m.id)).toEqual(['700']);
        expect(markets[0].eventId).toBe('parent-closed');
    });

    it('filters token membership before deduplication so a nonmatching duplicate cannot hide a match', async () => {
        const { exchange } = fixtureExchange([{ ...baseMarket, clobTokenIds: '["wrong","other"]' }], [{ ...baseMarket, closed: true, events: [closedParent] }]);
        expect((await exchange.fetchMarkets({ outcomeId: '7001' })).map(m => m.id)).toEqual(['700']);
    });

    it.each([
        ['array strings', ['7001', '7002'], ['700']],
        ['JSON strings', '["7001","7002"]', ['700']],
        ['prefix collision', '["70010","7002"]', []],
        ['numeric tokens', [7001, 7002], []],
        ['null', null, []],
        ['missing', undefined, []],
        ['malformed JSON', '[broken', []],
        ['JSON null', 'null', []],
        ['JSON scalar', '"7001"', []],
        ['object', { token: '7001' }, []],
    ])('handles %s raw token data with exact string membership', async (_name, tokens, expected) => {
        const { exchange } = fixtureExchange([{ ...baseMarket, clobTokenIds: tokens, events: [activeParent] }]);
        expect((await exchange.fetchMarkets({ outcomeId: '7001' })).map(m => m.id)).toEqual(expected);
    });

    it.each(['0', '1'])('does not treat synthesized outcome %s as a raw token', async outcomeId => {
        const { exchange } = fixtureExchange([{ ...baseMarket, clobTokenIds: undefined }], [], [{ ...baseMarket, clobTokenIds: undefined }]);
        expect(await exchange.fetchMarkets({ outcomeId })).toEqual([]);
    });

    it.each([null, {}, 'null'])('handles nonarray market response %p as empty without a catalog fallback', async open => {
        const { exchange, requests } = fixtureExchange(open, []);
        expect(await exchange.fetchMarkets({ outcomeId: '7001' })).toEqual([]);
        expect(requests.map(r => r.path)).toEqual(['/markets', '/markets']);
    });

    it('propagates a failed second partition rather than returning partial inclusive data', async () => {
        const { exchange, requests } = fixtureExchange([{ ...baseMarket, events: [activeParent] }], [], [], true);
        await expect(exchange.fetchMarkets({ outcomeId: '7001' })).rejects.toMatchObject({ status: 403 });
        expect(requests.map(r => r.params.closed)).toEqual([false, true]);
    });

    it('uses the first nested event when several event relations are present', async () => {
        const { exchange } = fixtureExchange([{ ...baseMarket, events: [closedParent, activeParent] }]);
        const [market] = await exchange.fetchMarkets({ outcomeId: '7001' });
        expect(market).toMatchObject({ eventId: 'parent-closed', title: 'Parent closed - Known choice?', tags: ['History'] });
        expect(market.outcomes.map(o => o.label)).toEqual(['Parent closed - Known choice?', 'Not Parent closed - Known choice?']);
    });

    it.each([undefined, []])('missing nested events %p use the question title without fabricating parent context', async events => {
        const { exchange } = fixtureExchange([{ ...baseMarket, events }]);
        const [market] = await exchange.fetchMarkets({ outcomeId: '7001' });
        expect(market).toMatchObject({ title: 'Known choice?', eventId: '700', tags: [] });
        expect(market.outcomes.map(o => o.label)).toEqual(['Known choice?', 'Not Known choice?']);
    });

    it('missing parent title on an existing market ID route uses the question and correct derived labels', async () => {
        const exchange = new PolymarketExchange();
        const http = (exchange as unknown as { http: AxiosInstance }).http;
        let count = 0;
        http.defaults.adapter = async config => {
            if (++count > 1 || config.method !== 'get' || new URL(config.url!).pathname !== '/markets') throw new Error('Single direct-market GET guard');
            return { status: 200, statusText: 'OK', headers: {}, config, data: [baseMarket] };
        };
        const [market] = await exchange.fetchMarkets({ marketId: '700' });
        expect(market).toMatchObject({ title: 'Known choice?', eventId: '700', url: 'https://polymarket.com/event/known-choice' });
        expect(market.outcomes.map(o => o.label)).toEqual(['Known choice?', 'Not Known choice?']);
    });

    it.each([null, undefined, ''])('missing parent title %p keeps actual parent identity while using the question', async title => {
        const { exchange } = fixtureExchange([{ ...baseMarket, events: [{ ...activeParent, title }] }]);
        const [market] = await exchange.fetchMarkets({ outcomeId: '7001' });
        expect(market).toMatchObject({ title: 'Known choice?', eventId: 'parent-open', url: 'https://polymarket.com/event/open-parent' });
    });

    it('preserves exact parent prefix and existing direct market ID question label fallback', async () => {
        const params = { marketId: '700', outcomeId: '7001' };
        const { exchange, requests } = fixtureExchange([], [], [baseMarket]);
        const [market] = await exchange.fetchMarkets(params);
        expect(market.title).toBe('Parent open - Known choice?');
        expect(market.outcomes.map(o => o.label)).toEqual(['Known choice?', 'Not Known choice?']);
        expect(requests.map(r => r.params)).toEqual([{ id: '700' }]);
    });

    const selectors: Array<[string, MarketFilterParams, string]> = [
        ['market ID', { marketId: '700', slug: 'ignored', eventId: 'ignored', query: 'ignored', outcomeId: '7001' }, '/markets'],
        ['slug', { slug: 'known-choice', eventId: 'ignored', query: 'ignored', outcomeId: '7001' }, '/markets/slug/known-choice'],
        ['event ID', { eventId: 'parent-open', query: 'ignored', outcomeId: '7001' }, '/events'],
        ['query', { query: 'Known', outcomeId: '7001', status: 'all' }, '/public-search'],
    ];
    it.each(selectors)('preserves %s routing priority ahead of outcome ID', async (_name, params, path) => {
        const { exchange, requests } = fixtureExchange([], [], [baseMarket]);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['700']);
        expect(requests.map(r => r.path)).toEqual([path]);
    });

    it.each(selectors)('%s combined lookup rejects synthetic 0 token matches before normalization', async (_name, params) => {
        const { exchange } = fixtureExchange([], [], [{ ...baseMarket, clobTokenIds: undefined }]);
        expect(await exchange.fetchMarkets({ ...params, outcomeId: '0' })).toEqual([]);
    });

    it('does not mutate raw market or nested event objects', async () => {
        const raw = [{ ...baseMarket, events: [closedParent] }];
        const before = JSON.stringify(raw);
        const { exchange } = fixtureExchange(raw, []);
        expect((await exchange.fetchMarkets({ outcomeId: '7001' })).map(m => m.id)).toEqual(['700']);
        expect(JSON.stringify(raw)).toBe(before);
    });
});
