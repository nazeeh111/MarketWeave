import { AxiosInstance } from 'axios';
import { MarketFilterParams } from '../../src/BaseExchange';
import { PolymarketExchange } from '../../src/exchanges/polymarket';
import { PolymarketRawEvent, PolymarketRawMarket } from '../../src/exchanges/polymarket/fetcher';

// Controlled venue fixtures exercise the real public wrapper, fetcher and
// normalizer. Only Axios transport is replaced; no live API or account is used.
// Literal expected IDs catch child-status filtering after sorting/limit, using
// the parent status, dropping inclusive ID lookups, or treating archived as closed.
const children: PolymarketRawMarket[] = [
    { id: '103', slug: 'signal-inactive', question: 'Signal inactive', active: false, closed: false, archived: false, volume24hr: 999, outcomes: '["Yes","No"]', clobTokenIds: '["1031","1032"]', endDate: '2030-01-01T00:00:00Z' },
    { id: '104', slug: 'signal-closed', question: 'Signal closed', active: true, closed: true, archived: false, volume24hr: 900, outcomes: '["Yes","No"]', outcomePrices: '["1","0"]', clobTokenIds: '["1041","1042"]', endDate: '2030-01-01T00:00:00Z' },
    { id: '105', slug: 'signal-archived', question: 'Signal archived', active: true, closed: false, archived: true, volume24hr: 800, outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]', clobTokenIds: '["1051","1052"]', endDate: '2030-01-01T00:00:00Z' },
    { id: '106', slug: 'signal-archived-closed', question: 'Signal archived closed', active: false, closed: true, archived: true, volume24hr: 700, outcomes: '["Yes","No"]', outcomePrices: '["0","1"]', clobTokenIds: '["1061","1062"]', endDate: '2030-01-01T00:00:00Z' },
    { id: '101', slug: 'signal-low', question: 'Signal low', active: true, closed: false, archived: false, volume24hr: 1, outcomes: '["Yes","No"]', outcomePrices: '["0.3","0.7"]', clobTokenIds: '["1011","1012"]', endDate: '2030-01-01T00:00:00Z' },
    { id: '102', slug: 'signal-high', question: 'Signal high', active: true, closed: false, archived: false, volume24hr: 2, outcomes: '["Yes","No"]', outcomePrices: '["0.2","0.8"]', clobTokenIds: '["1021","1022"]', endDate: '2030-01-01T00:00:00Z' },
];
const parent: PolymarketRawEvent = {
    id: 'event-status', slug: 'signal-parent', title: 'Signal parent',
    description: 'Controlled mixed-lifecycle children under an active event.',
    active: true, closed: false, archived: false, tags: [{ label: 'Fixture' }],
    markets: children,
};

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

function exchangeWithResponse(params: MarketFilterParams = {}): { exchange: PolymarketExchange; raw: unknown; requests: Array<{ params: unknown }> } {
    const market = children.find(m => m.id === params.marketId || m.slug === params.slug);
    const outcomeLookup = !!(params.outcomeId && !params.marketId && !params.slug && !params.eventId && !params.query);
    const raw = deepFreeze(JSON.parse(JSON.stringify(
        params.marketId ? [{ ...market, events: [{ ...parent, markets: undefined }] }]
            : params.slug ? { ...market, events: [{ ...parent, markets: undefined }] }
                : params.query ? { events: [parent], pagination: { hasMore: false } }
                    : outcomeLookup ? [{ ...children[0], events: [{ ...parent, markets: undefined }] }]
                        : [parent],
    )));
    const exchange = new PolymarketExchange();
    const http = (exchange as unknown as { http: AxiosInstance }).http;
    const requests: Array<{ params: unknown }> = [];
    http.defaults.adapter = async config => {
        requests.push({ params: config.params });
        if (requests.length > (outcomeLookup ? 2 : 1) || config.method !== 'get') throw new Error('Read-only bounded transport guard');
        const pathname = new URL(config.url!).pathname;
        const expectedPath = params.marketId || outcomeLookup ? '/markets' : params.slug ? `/markets/slug/${params.slug}` : params.query ? '/public-search' : '/events';
        if (pathname !== expectedPath) throw new Error(`Unexpected fixture route: ${pathname}`);
        return { status: 200, statusText: 'OK', headers: {}, config, data: outcomeLookup && config.params.closed === true ? [] : raw };
    };
    return { exchange, raw, requests };
}

describe('Polymarket public market lifecycle filtering', () => {
    it('explicit active includes only active, nonclosed, nonarchived children', async () => {
        const { exchange } = exchangeWithResponse();
        expect((await exchange.fetchMarkets({ status: 'active' })).map(m => m.id)).toEqual(['102', '101']);
    });

    it('default discovery filters children before volume sorting and result limit', async () => {
        const { exchange } = exchangeWithResponse();
        expect((await exchange.fetchMarkets({ limit: 1 })).map(m => m.id)).toEqual(['102']);
    });

    it('explicit all preserves inactive, closed and archived children', async () => {
        const { exchange } = exchangeWithResponse();
        const markets = await exchange.fetchMarkets({ status: 'all' });
        expect(markets.map(m => m.id)).toEqual(['103', '104', '105', '106', '102', '101']);
        expect(markets.find(m => m.id === '103')!.outcomes.map(o => o.price)).toEqual([0, 0]);
    });

    it.each(['closed', 'inactive'] as const)('%s selects raw closed children and excludes archived-only children', async status => {
        const { exchange } = exchangeWithResponse();
        expect((await exchange.fetchMarkets({ status })).map(m => m.id)).toEqual(['104', '106']);
    });

    it('default query discovery filters child status before title matching and limit', async () => {
        const params = { query: 'Signal', limit: 1 };
        const { exchange, requests } = exchangeWithResponse(params);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['101']);
        expect(requests[0].params).toMatchObject({ events_status: 'active' });
    });

    it('explicit all query keeps inactive matches', async () => {
        const params = { query: 'Signal inactive', status: 'all' as const };
        const { exchange, requests } = exchangeWithResponse(params);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['103']);
        expect(requests[0].params).toMatchObject({ events_status: undefined });
    });

    it('explicit active query excludes an inactive title match', async () => {
        const params = { query: 'Signal inactive', status: 'active' as const };
        const { exchange } = exchangeWithResponse(params);
        expect(await exchange.fetchMarkets(params)).toEqual([]);
    });

    const directLookups: Array<[string, MarketFilterParams, string[]]> = [
        ['market ID', { marketId: '103' }, ['103']],
        ['slug', { slug: 'signal-inactive' }, ['103']],
        ['event ID', { eventId: 'event-status' }, ['103', '104', '105', '106', '101', '102']],
        ['outcome ID', { outcomeId: '1031' }, ['103']],
    ];

    it.each(directLookups)('omitted-status %s lookup preserves children within its existing retrieval scope', async (name, params, expectedIds) => {
        const { exchange, requests } = exchangeWithResponse(params);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(expectedIds);
        if (name === 'market ID') expect(requests[0].params).toEqual({ id: '103' });
        if (name === 'slug') expect(requests[0].params).toBeUndefined();
        if (name === 'event ID') expect(requests[0].params).toEqual({ id: 'event-status' });
    });

    it.each(directLookups)('explicit active applies to %s lookup before outcome filtering', async (name, params) => {
        const { exchange } = exchangeWithResponse(params);
        const expectedIds = name === 'event ID' ? ['101', '102'] : [];
        expect((await exchange.fetchMarkets({ ...params, status: 'active' })).map(m => m.id)).toEqual(expectedIds);
    });

    it('explicit closed applies to market ID lookup using raw closed flag', async () => {
        const params = { marketId: '106', status: 'closed' as const };
        const { exchange } = exchangeWithResponse(params);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['106']);
    });

    it('explicit closed removes a nonclosed direct lookup', async () => {
        const params = { marketId: '103', status: 'closed' as const };
        const { exchange } = exchangeWithResponse(params);
        expect(await exchange.fetchMarkets(params)).toEqual([]);
    });

    it('filtering leaves raw event and child bytes unchanged', async () => {
        const { exchange, raw } = exchangeWithResponse();
        const before = JSON.stringify(raw);
        expect((await exchange.fetchMarkets({ status: 'active' })).map(m => m.id)).toEqual(['102', '101']);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it('fetchEvents remains inclusive of its mixed-lifecycle children', async () => {
        const { exchange } = exchangeWithResponse();
        const events = await exchange.fetchEvents({ eventId: 'event-status' });
        expect(events[0].markets.map(m => m.id)).toEqual(['103', '104', '105', '106', '101', '102']);
    });

    it('omitted-status outcome ID lookup reads both market partitions without extra child exclusion', async () => {
        const params = { outcomeId: '1031' };
        const { exchange, requests } = exchangeWithResponse(params);
        expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['103']);
        expect(requests.map(r => r.params)).toEqual([
            { clob_token_ids: ['1031'], closed: false },
            { clob_token_ids: ['1031'], closed: true },
        ]);
    });

    it.each(['closed', 'inactive'] as const)('%s discovery retains closed-parent retrieval predicates', async status => {
        const { exchange, requests } = exchangeWithResponse();
        expect((await exchange.fetchMarkets({ status })).map(m => m.id)).toEqual(['104', '106']);
        expect(requests[0].params).toMatchObject({ active: 'false', closed: 'true' });
    });

    it.each(['unsupported', '', null, 7])('rejects invalid runtime status %p instead of selecting closed children', async status => {
        const { exchange } = exchangeWithResponse();
        await expect(exchange.fetchMarkets({ status } as unknown as MarketFilterParams)).rejects.toMatchObject({
            name: 'BadRequest', status: 400, code: 'BAD_REQUEST',
        });
    });
});

describe('Polymarket market search sort selection', () => {
    function searchExchange(status?: MarketFilterParams['status'], paged = false) {
        const closed = status === 'closed' || status === 'inactive';
        const event = (id: string, startDate: string, volume: number, liquidity: number): PolymarketRawEvent => ({
            id: `parent-${id}`, title: `Fixture ${id}`, slug: `fixture-${id}`, startDate,
            volume, liquidity, active: !closed, closed,
            markets: [{ id, question: 'Order candidate', active: !closed, closed,
                outcomes: '["Yes","No"]', clobTokenIds: JSON.stringify([`${id}1`, `${id}2`]),
                volume24hr: volume, liquidity, endDate: '2030-01-01T00:00:00Z' }],
        });
        const raw = deepFreeze([
            event('410', '2026-10-01T00:00:00Z', 1, 1),
            event('420', '2020-01-01T00:00:00Z', 100, 2),
            event('430', '2024-01-01T00:00:00Z', 2, 100),
        ]);
        const exchange = new PolymarketExchange();
        const http = (exchange as unknown as { http: AxiosInstance }).http;
        const requests: Array<Record<string, any>> = [];
        http.defaults.adapter = async config => {
            if (config.method !== 'get' || new URL(config.url!).pathname !== '/public-search' || requests.length >= (paged ? 2 : 1)) {
                throw new Error('Bounded public-search transport guard');
            }
            requests.push(config.params);
            // Controlled provider-shaped ordering; no fetcher or normalizer mock.
            const ordered = [...raw].sort((a, b) => config.params.sort === 'startDate'
                ? Date.parse(String(b.startDate)) - Date.parse(String(a.startDate))
                : Number(b[config.params.sort]) - Number(a[config.params.sort]));
            const data = { events: paged ? (config.params.page === 1 ? ordered.slice(0, 1) : ordered.slice(1)) : ordered,
                pagination: { hasMore: paged && config.params.page === 1, totalResults: 51 } };
            return { status: 200, statusText: 'OK', headers: {}, config, data };
        };
        return { exchange, requests, raw };
    }

    it.each([
        [undefined, 'volume', '420'], ['volume', 'volume', '420'],
        ['newest', 'startDate', '410'], ['liquidity', 'liquidity', '430'],
    ] as const)('market search sort %p sends %s and retains its returned order before limit', async (sort, expectedSort, id) => {
        const { exchange, requests } = searchExchange();
        expect((await exchange.fetchMarkets({ query: 'Order', sort, limit: 1 })).map(m => m.id)).toEqual([id]);
        expect(requests[0]).toMatchObject({ q: 'Order', sort: expectedSort, ascending: false, events_status: 'active' });
    });

    it.each(['closed', 'inactive', 'all'] as const)('newest market search retains %s selection', async status => {
        const { exchange, requests } = searchExchange(status);
        expect((await exchange.fetchMarkets({ query: 'Order', sort: 'newest', status, limit: 1 })).map(m => m.id)).toEqual(['410']);
        expect(requests[0]).toMatchObject({ sort: 'startDate', events_status: status === 'all' ? undefined : 'closed' });
    });

    it('preserves newest query order before public offset/limit and leaves raw bytes unchanged', async () => {
        const { exchange, raw } = searchExchange();
        const before = JSON.stringify(raw);
        expect((await exchange.fetchMarkets({ query: 'Order', sort: 'newest', offset: 2, limit: 1 })).map(m => m.id)).toEqual(['420']);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it('forwards the selected sort to every existing search page', async () => {
        const { exchange, requests } = searchExchange(undefined, true);
        expect((await exchange.fetchMarkets({ query: 'Order', sort: 'newest' })).map(m => m.id)).toEqual(['410', '430', '420']);
        expect(requests.map(p => ({ sort: p.sort, page: p.page, ascending: p.ascending }))).toEqual([
            { sort: 'startDate', page: 1, ascending: false }, { sort: 'startDate', page: 2, ascending: false },
        ]);
    });
});

describe('Polymarket newest discovery ordering', () => {
    function orderedDiscovery(status?: MarketFilterParams['status'], rejectedChild = false) {
        const closed = status === 'closed' || status === 'inactive';
        const child = (id: string, volume24hr: number, liquidity: number): PolymarketRawMarket => ({
            id, question: `Order ${id}`, active: !closed, closed, archived: false,
            volume24hr, liquidity, outcomes: '["Yes","No"]',
            clobTokenIds: JSON.stringify([`${id}1`, `${id}2`]), endDate: '2030-01-01T00:00:00Z',
        });
        const first = child('310', 1, 100);
        const raw = deepFreeze([
            { id: 'new-parent', slug: 'new-parent', title: 'Newest parent',
                startDate: '2026-10-01T00:00:00Z', active: !closed, closed,
                markets: rejectedChild ? [{ ...child('399', 999, 999), archived: true }, first] : [first] },
            { id: 'old-parent', slug: 'old-parent', title: 'Older parent',
                startDate: '2020-01-01T00:00:00Z', active: !closed, closed,
                markets: [child('320', 100, 1)] },
        ]);
        const exchange = new PolymarketExchange();
        const http = (exchange as unknown as { http: AxiosInstance }).http;
        const requests: Array<Record<string, unknown>> = [];
        http.defaults.adapter = async config => {
            if (config.method !== 'get' || new URL(config.url!).pathname !== '/events' || requests.length > 0) {
                throw new Error('One-request discovery transport guard');
            }
            requests.push(config.params);
            return { status: 200, statusText: 'OK', headers: {}, config, data: raw };
        };
        return { exchange, requests, raw };
    }

    it.each([undefined, 'active', 'closed', 'inactive', 'all'] as const)(
        'newest status %p keeps returned parent date order before limit', async status => {
            const { exchange, requests } = orderedDiscovery(status);
            const params = { sort: 'newest' as const, limit: 1, ...(status === undefined ? {} : { status }) };
            expect((await exchange.fetchMarkets(params)).map(m => m.id)).toEqual(['310']);
            expect(requests).toHaveLength(1);
            expect(requests[0]).toMatchObject({ order: 'startDate', ascending: 'false' });
        },
    );

    it('filters raw child status without changing newest order or raw bytes', async () => {
        const { exchange, raw } = orderedDiscovery(undefined, true);
        const before = JSON.stringify(raw);
        expect((await exchange.fetchMarkets({ sort: 'newest', limit: 1 })).map(m => m.id)).toEqual(['310']);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it('keeps newest order before the public offset and limit', async () => {
        const { exchange } = orderedDiscovery();
        expect((await exchange.fetchMarkets({ sort: 'newest', offset: 1, limit: 1 })).map(m => m.id)).toEqual(['320']);
    });

    it.each([
        ['volume', ['320', '310']],
        ['liquidity', ['310', '320']],
    ] as const)('preserves explicit %s ranking', async (sort, expected) => {
        const { exchange } = orderedDiscovery();
        expect((await exchange.fetchMarkets({ sort })).map(m => m.id)).toEqual(expected);
    });
});
