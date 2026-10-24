import { types } from 'util';
import { ErrorMapper } from '../../src/utils/error-mapper';
import {
    BaseError, BadRequest, AuthenticationError, PermissionDenied, NotFound,
    OrderNotFound, MarketNotFound, EventNotFound, RateLimitExceeded,
    InvalidOrder, InsufficientFunds, ValidationError, NotSupported,
    NetworkError, ExchangeNotAvailable,
} from '../../src/errors';

const cases: [string, (exchange?: string) => BaseError][] = [
    ['BaseError', exchange => new BaseError('original', 418, 'CUSTOM', true, exchange)],
    ['BadRequest', exchange => new BadRequest('original', exchange)],
    ['AuthenticationError', exchange => new AuthenticationError('original', exchange)],
    ['PermissionDenied', exchange => new PermissionDenied('original', exchange)],
    ['NotFound', exchange => new NotFound('original', exchange)],
    ['OrderNotFound', exchange => new OrderNotFound('order-1', exchange)],
    ['MarketNotFound', exchange => new MarketNotFound('market-1', exchange)],
    ['EventNotFound', exchange => new EventNotFound('event-1', exchange)],
    ['RateLimitExceeded', exchange => new RateLimitExceeded('wait', 12, exchange)],
    ['InvalidOrder', exchange => new InvalidOrder('original', exchange)],
    ['InsufficientFunds', exchange => new InsufficientFunds('original', exchange)],
    ['ValidationError', exchange => new ValidationError('original', 'limit', exchange)],
    ['NotSupported', exchange => new NotSupported('original', exchange)],
    ['NetworkError', exchange => new NetworkError('original', exchange)],
    ['ExchangeNotAvailable', exchange => new ExchangeNotAvailable('original', exchange)],
];

for (const [name, create] of cases) {
    it(`adds exchange context to ${name} without changing its data`, () => {
        const original = create();
        const mapper = new ErrorMapper('Synthetic');
        const mapped = mapper.mapError(original);
        expect(mapped).not.toBe(original);
        expect(Object.getPrototypeOf(mapped)).toBe(Object.getPrototypeOf(original));
        expect(types.isNativeError(mapped)).toBe(true);
        expect(mapped.exchange).toBe('Synthetic');
        expect(original.exchange).toBe(undefined);
        for (const key of ['name', 'message', 'status', 'code', 'retryable', 'retryAfter', 'field']) {
            expect((mapped as any)[key]).toBe((original as any)[key]);
        }
        const contextual = create('Existing');
        expect(mapper.mapError(contextual)).toBe(contextual);
        expect(new ErrorMapper().mapError(original)).toBe(original);
    });
}

it('preserves frozen error metadata, cause, symbol properties and stack', () => {
    const original = new ValidationError('original', 'limit');
    const marker = Symbol('marker');
    const cause = new Error('original cause');
    Object.defineProperty(original, marker, { value: 17, enumerable: false });
    Object.defineProperty(original, 'cause', { value: cause, enumerable: false });
    Object.freeze(original);
    const mapped = new ErrorMapper('Synthetic').mapError(original);
    expect((mapped as any)[marker]).toBe(17);
    expect((mapped as any).cause).toBe(cause);
    expect(mapped.stack).toBe(original.stack);
    expect(Object.getOwnPropertyDescriptor(mapped, marker)).toEqual(Object.getOwnPropertyDescriptor(original, marker));
    expect(Object.getOwnPropertyDescriptor(mapped, 'cause')).toEqual(Object.getOwnPropertyDescriptor(original, 'cause'));
    expect(original.exchange).toBe(undefined);
});

it('keeps the existing constructor path for external subclasses with private state', () => {
    class ExternalError extends BaseError {
        #detail = 'private detail';
        constructor(message: string, exchange?: string) {
            super(message, 409, 'EXTERNAL', false, exchange);
        }
        detail() { return this.#detail; }
    }
    const original = new ExternalError('original');
    const mapped = new ErrorMapper('Synthetic').mapError(original) as ExternalError;
    expect(mapped.detail()).toBe('private detail');
    expect(mapped.exchange).toBe('Synthetic');
    expect(original.exchange).toBe(undefined);
    expect(mapped).not.toBe(original);
});

it('adds context when exchange is an own accessor without mixing descriptor kinds', () => {
    const original = new BadRequest('original');
    let getterCalls = 0;
    let setterCalls = 0;
    Object.defineProperty(original, 'exchange', {
        get: () => { getterCalls++; return undefined; },
        set: () => { setterCalls++; },
        enumerable: false,
        configurable: false,
    });
    const before = Object.getOwnPropertyDescriptor(original, 'exchange');
    const mapped = new ErrorMapper('Synthetic').mapError(original);
    expect(mapped.exchange).toBe('Synthetic');
    expect(getterCalls).toBe(1);
    expect(setterCalls).toBe(0);
    expect(Object.getOwnPropertyDescriptor(original, 'exchange')).toEqual(before);
    expect(Object.getOwnPropertyDescriptor(mapped, 'exchange')).toEqual({
        value: 'Synthetic', writable: true, enumerable: false, configurable: false,
    });
    expect(types.isNativeError(mapped)).toBe(true);
});

it('uses ordinary data-field attributes when the own exchange property is absent', () => {
    const original = new BadRequest('original');
    delete (original as any).exchange;
    const mapped = new ErrorMapper('Synthetic').mapError(original);
    expect(Object.getOwnPropertyDescriptor(original, 'exchange')).toBe(undefined);
    expect(Object.getOwnPropertyDescriptor(mapped, 'exchange')).toEqual({
        value: 'Synthetic', writable: true, enumerable: true, configurable: true,
    });
    expect(types.isNativeError(mapped)).toBe(true);
});

it('retains frozen exchange data-field attributes on the contextual copy', () => {
    const original = Object.freeze(new RateLimitExceeded('wait', 12));
    const mapped = new ErrorMapper('Synthetic').mapError(original);
    expect(Object.getOwnPropertyDescriptor(mapped, 'exchange')).toEqual({
        value: 'Synthetic', writable: false, enumerable: true, configurable: false,
    });
    expect(original.exchange).toBe(undefined);
    expect((mapped as RateLimitExceeded).retryAfter).toBe(12);
    expect(mapped.stack).toBe(original.stack);
});
