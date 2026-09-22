# MarketWeave compatibility notes

This publication preserves the existing computational interfaces. Package names, command names, exchange identifiers, transport routes, hosted endpoints, user-agent values, schemas and error messages remain compatible. The repository identity and documentation styling change independently.

## Implementation boundary

The execution-price helper uses clearer local names and comments and removes one unused type import. Its sorting direction, filtering, arithmetic order, fill tolerance, return fields and exceptions are unchanged. All other core and SDK runtime source files are unchanged.

## Verification

- Core TypeScript build: passed.
- TypeScript SDK CommonJS and ESM builds: passed after regenerating the ignored client from `core/src/server/openapi.yaml` with the pinned OpenAPI generator.
- Recorded-data normalizer tests and README exchange coverage: 9 suites, 562 tests passed.
- Deterministic comparison with the pre-publication implementation: 22,000 exact execution-price results and exceptions matched. Cases cover both sides, empty books, zero-size levels, partial fills, small amounts, zero/negative amounts, NaN and infinity. Input books remained unchanged.
- Dependency versions are retained in the lockfile. On this Mac, Jest required restoration of its missing optional native resolver at the locked version 1.11.1.

These checks establish the tested behavior, not universal correctness. Live market data, account actions, hosted services and trading were not exercised. Existing hosted URLs describe external dependencies and do not imply that this repository deploys a service.

## Source setup

Install dependencies with `npm ci`, build `pmxt-core`, run `npm run generate:sdk:typescript --workspace=pmxt-core`, then build `pmxtjs`. Generation uses the pinned free OpenAPI generator and requires Java. Generated clients and build outputs stay untracked, as in the existing workspace layout.
