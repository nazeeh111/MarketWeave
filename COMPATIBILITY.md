# MarketWeave compatibility notes

The original publication preserved the existing computational interfaces, package and command names, exchange identifiers, transport routes, hosted endpoints, user-agent values, schemas and error messages while changing repository identity and documentation styling. The later corrections below change market filtering, outcome lookup, missing-parent titles and discovery/search sorting, and reject invalid status values. Public names and schemas remain unchanged.

## Implementation boundary

The execution-price helper uses clearer local names and comments and removes one unused type import. Its sorting direction, filtering, arithmetic order, fill tolerance, return fields and exceptions are unchanged. The original publication left all other core and SDK runtime source files unchanged. The Polymarket corrections below are later behavior fixes.

## Polymarket market status

`fetchMarkets` filters child markets within the parent responses fetched from Gamma before search matching, sorting and result limits. Discovery defaults to active children that are neither closed nor archived. Explicit `closed` and `inactive` select children whose raw `closed` flag is true; an archived child is included only if it is also closed. `all` preserves every child in the fetched responses.

Parent retrieval for discovery and search is unchanged. Default discovery selects active, nonclosed events; closed/inactive discovery selects closed events, so it does not guarantee closed children under active parent events. Direct `marketId`, `slug` and `eventId` lookups preserve all returned children when status is omitted. Explicit status filters the returned children in each lookup mode. Query discovery retains its existing event-status predicate. Unsupported status values produce `BadRequest` before a venue request. `fetchEvents`, price fallbacks and normalized data fields are unchanged.

## Polymarket outcome lookup

Selector priority remains `marketId`, `slug`, `eventId`, `query`, then `outcomeId`. When outcome ID is the selected lookup, Gamma `/markets` receives `clob_token_ids` through the existing array serializer. Active uses `closed=false`; closed/inactive uses `closed=true`; omitted status and `all` explicitly read both partitions because the provider documents a default of `closed=false`. This path makes at most two requests, with no catalog fallback or pagination. A failed partition rejects the entire lookup rather than returning partial inclusive results.

Raw `clobTokenIds` must contain the exact requested string, as an array or JSON-encoded array. Missing, null, malformed and nonarray token data cannot match normalized fallback IDs such as `0` or `1`. This raw check also applies when outcome ID accompanies a higher-priority selector. Matching market IDs are deduplicated in response order before normalization. The first nested event supplies parent context, as on existing market ID/slug lookups; absent relations retain the historical market-as-event fallback, which does not establish a real parent identity.

When the parent title is absent, the market question supplies the title. This corrects the former `undefined - Question` title and binary labels derived from it. Existing titled-parent prefixes, question/group option labels, source metadata and missing-price behavior are preserved.

These changes were checked through the actual public class with controlled transport fixtures, not successful live token responses. The bounded public catalog probes returned HTTP 403, including a Cloudflare browser-signature denial, so current live token-query compatibility remains unavailable. Discovery/search parent exclusions, search child retention and the existing pagination cap/request expansion remain outside this correction. A token query receives a single provider response per partition; it does not claim venue-wide enumeration completeness.

## Polymarket newest discovery

For non-search discovery, `sort: "newest"` preserves the returned parent order from Gamma's existing descending `startDate` request after child filtering and before the public offset/limit. Previously, client-side volume sorting overwrote that date order. This describes ordering within the fetched parent responses, not a global ranking of individual market creation dates. Default volume ranking and explicit volume/liquidity ranking are unchanged. Search, direct lookup, outcome lookup and parent retrieval behavior are unchanged by this ordering correction.

## Polymarket market search sorting

Market query search now uses the same sort translation as the existing event-search path: `newest` sends `startDate`, `liquidity` sends `liquidity`, and omitted/explicit volume sends `volume`, always descending. Previously market search sent volume regardless of the selection. The existing parent/child response order is retained through status and text filtering before public offset/limit, with the chosen sort forwarded to every search page. This is parent-response ordering within the existing retrieval window, not global ranking of individual markets.

The [Gamma search reference](https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles) defines string `sort` and boolean `ascending` without enumerating accepted sort values. These translations reuse the client’s existing event-search convention. Controlled transport cases verify outgoing parameters and returned ordering; current successful live acceptance remains unverified after the earlier HTTP 403. Search status predicates, child retention, page expansion, higher-priority selectors and non-search discovery are unchanged.

## Polymarket empty search pages

Later search pages with null or omitted `events` now contribute an empty list, as the first page already does. Previously these values entered the combined result and crashed market normalization or event filtering. Results from other planned pages retain their order; a failed request or null/absent response body still rejects the search. Search predicates, page selection, caps and public offset/limit behavior are unchanged.

The [Gamma search response reference](https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles) permits a nullable event list. Controlled responses verify this case through both public search methods; they do not establish successful current live provider access or complete catalog coverage.

## Polymarket search continuation without a total

When the first page reports `hasMore: true` but omits `totalResults` or sets it to null, both public search methods now reject with the existing non-retryable `NotSupported` error. Previously the client treated the missing total as zero and returned only the first page, or an empty result. The guard runs before the empty-first-page return and makes no additional requests. Terminal pages without a total remain accepted; counted pagination and its later pages are unchanged.

The included provider schema permits an omitted total. This is an unsupported continuation state in this client, rather than a claim that an omitted total violates the provider schema. A complete fallback still needs verified pagination semantics and a resource policy; no sequential crawl or catalog-completeness claim is introduced. Other existing pagination limitations remain.

## Original publication verification

- Core TypeScript build: passed.
- TypeScript SDK CommonJS and ESM builds: passed after regenerating the ignored client from `core/src/server/openapi.yaml` with the pinned OpenAPI generator.
- Fixture-based normalizer tests and README exchange coverage: 9 suites, 562 tests passed.
- Deterministic comparison with the pre-publication implementation: 22,000 exact execution-price results and exceptions matched. Cases cover both sides, empty books, zero-size levels, partial fills, small amounts, zero/negative amounts, NaN and infinity. Input books remained unchanged.
- Dependency versions are retained in the lockfile. On this Mac, Jest required restoration of its missing optional native resolver at the locked version 1.11.1.

These publication checks establish the tested behavior, not universal correctness. Live market data, account actions, hosted services and trading were not exercised in those checks. Existing hosted URLs describe external dependencies and do not imply that this repository deploys a service.

## Source setup

Install dependencies with `npm ci`, build `pmxt-core`, run `npm run generate:sdk:typescript --workspace=pmxt-core`, then build `pmxtjs`. Generation uses the pinned free OpenAPI generator and requires Java. Generated clients and build outputs stay untracked, as in the existing workspace layout.
