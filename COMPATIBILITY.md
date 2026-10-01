# MarketWeave compatibility notes

The original publication preserved the existing computational interfaces, package and command names, exchange identifiers, transport routes, hosted endpoints, user-agent values, schemas and error messages while changing repository identity and documentation styling. The later status correction below changes market filtering and rejects invalid status values; names, routes and schemas remain unchanged.

## Implementation boundary

The execution-price helper uses clearer local names and comments and removes one unused type import. Its sorting direction, filtering, arithmetic order, fill tolerance, return fields and exceptions are unchanged. The original publication left all other core and SDK runtime source files unchanged. The Polymarket correction below is a later behavior fix.

## Polymarket market status

`fetchMarkets` filters child markets within the parent responses fetched from Gamma before search matching, sorting and result limits. Discovery defaults to active children that are neither closed nor archived. Explicit `closed` and `inactive` select children whose raw `closed` flag is true; an archived child is included only if it is also closed. `all` preserves every child in the fetched responses.

Parent retrieval is unchanged. Default discovery selects active, nonclosed events; closed/inactive discovery selects closed events, so it does not guarantee closed children under active parent events. Direct `marketId`, `slug` and `eventId` lookups preserve all returned children when status is omitted. An omitted-status `outcomeId` lookup still uses active-event discovery, with no additional child exclusion. Explicit status filters the returned children in each lookup mode. Query discovery likewise retains its existing event-status predicate. Unsupported status values produce `BadRequest` before a venue request. `fetchEvents`, price fallbacks and normalized data fields are unchanged.

## Original publication verification

- Core TypeScript build: passed.
- TypeScript SDK CommonJS and ESM builds: passed after regenerating the ignored client from `core/src/server/openapi.yaml` with the pinned OpenAPI generator.
- Recorded-data normalizer tests and README exchange coverage: 9 suites, 562 tests passed.
- Deterministic comparison with the pre-publication implementation: 22,000 exact execution-price results and exceptions matched. Cases cover both sides, empty books, zero-size levels, partial fills, small amounts, zero/negative amounts, NaN and infinity. Input books remained unchanged.
- Dependency versions are retained in the lockfile. On this Mac, Jest required restoration of its missing optional native resolver at the locked version 1.11.1.

These publication checks establish the tested behavior, not universal correctness. Live market data, account actions, hosted services and trading were not exercised in those checks. Existing hosted URLs describe external dependencies and do not imply that this repository deploys a service.

## Source setup

Install dependencies with `npm ci`, build `pmxt-core`, run `npm run generate:sdk:typescript --workspace=pmxt-core`, then build `pmxtjs`. Generation uses the pinned free OpenAPI generator and requires Java. Generated clients and build outputs stay untracked, as in the existing workspace layout.
