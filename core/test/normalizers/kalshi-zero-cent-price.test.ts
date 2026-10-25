import { KalshiNormalizer } from '../../src/exchanges/kalshi/normalizer';
import { KalshiRawMarket } from '../../src/exchanges/kalshi/fetcher';

const normalizer = new KalshiNormalizer();

describe('Kalshi legacy cent price presence', () => {
    const cases: Array<[Partial<KalshiRawMarket>, number]> = [
        [{ last_price: 0, yes_bid: 20, yes_ask: 40 }, 0],
        [{ yes_bid: 0, yes_ask: 60 }, 0.3],
        [{ yes_bid: 0, yes_ask: 0 }, 0],
        [{ last_price: 0, last_price_dollars: '0.4500', yes_bid: 20, yes_ask: 40 }, 0.45],
    ];
    it.each(cases)('retains zero fields in the existing price precedence: %p', (prices, expected) => {
        const raw: KalshiRawMarket = {
            ticker: 'SYNTH-26-CHOICE',
            title: 'Synthetic choice',
            expiration_time: '2030-01-01T00:00:00Z',
            ...prices,
        };
        const event = { event_ticker: 'SYNTH-26', title: 'Synthetic event', markets: [raw] };
        const before = JSON.stringify(raw);
        const market = normalizer.normalizeRawMarket(event, raw)!;
        expect(market.outcomes[0].price).toBeCloseTo(expected);
        expect(market.outcomes[1].price).toBeCloseTo(1 - expected);
        expect(market.marketId).toBe(raw.ticker);
        expect(market.outcomes[0].outcomeId).toBe(raw.ticker);
        expect(market.outcomes[1].outcomeId).toBe(`${raw.ticker}-NO`);
        expect(JSON.stringify(raw)).toBe(before);
    });
});
