import { OrderBook } from '../types';

export function getExecutionPrice(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): number {
    const estimate = getExecutionPriceDetailed(orderBook, side, amount);
    return estimate.fullyFilled ? estimate.price : 0;
}

export interface ExecutionPriceResult {
    price: number;
    filledAmount: number;
    fullyFilled: boolean;
}

export function getExecutionPriceDetailed(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): ExecutionPriceResult {
    if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
    }

    // Filtering creates a separate array, so sorting leaves the caller's book intact.
    const executableLevels = (side === 'buy' ? orderBook.asks : orderBook.bids).filter(l => l.size > 0);

    // Consume the cheapest asks for buys and the highest bids for sells.
    executableLevels.sort((a, b) => side === 'buy' ? a.price - b.price : b.price - a.price);

    if (executableLevels.length === 0) {
        return {
            price: 0,
            filledAmount: 0,
            fullyFilled: false,
        };
    }

    let unfilledAmount = amount;
    let weightedCost = 0;
    let filledAmount = 0;

    // Preserve the established floating-point fill threshold.
    const FILL_TOLERANCE = 0.00000001;

    for (const level of executableLevels) {
        if (unfilledAmount <= FILL_TOLERANCE) {
            break;
        }

        const fillSize = Math.min(unfilledAmount, level.size);

        weightedCost += fillSize * level.price;
        filledAmount += fillSize;

        unfilledAmount -= fillSize;
    }

    const fullyFilled = unfilledAmount <= FILL_TOLERANCE;
    const executionPrice = filledAmount > FILL_TOLERANCE ? weightedCost / filledAmount : 0;

    return {
        price: executionPrice,
        filledAmount,
        fullyFilled,
    };
}
