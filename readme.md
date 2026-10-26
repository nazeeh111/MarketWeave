# MarketWeave

A common interface for prediction-market data, order books, execution estimates and supported venue operations. MarketWeave brings the TypeScript core, Python SDK and command-line tools into one source workspace.

## Choose an entry point

| Goal | Start here |
| --- | --- |
| Understand the components | [Architecture](ARCHITECTURE.md) |
| Integrate Python or TypeScript | [Integration reference](docs/COMPATIBILITY_GUIDE.md) |
| Explore the core API | [API reference](core/API_REFERENCE.md) |
| Use the terminal | [CLI guide](sdks/cli/README.md) |
| Work on the code | [Contribution guide](CONTRIBUTING.md) |
| Inspect preservation checks | [Compatibility notes](COMPATIBILITY.md) |

## Start with the source

Use Node.js 18 or later, npm, and Java 11 or later with `node`, `npm`, and `java` available on your PATH. The SDK generation command runs OpenAPI Generator through Java and downloads its pinned generator on first use.

```sh
git clone https://github.com/nazeeh111/MarketWeave.git
cd MarketWeave
npm ci
npm run build --workspace=pmxt-core
npm run generate:sdk:typescript --workspace=pmxt-core
npm run build --workspace=pmxtjs
```

Package names (`pmxt-core`, `pmxtjs`, `pmxt`) and command names are retained as compatibility interfaces. No new registry packages are required for this source checkout. Existing response fields, calculations, transport routes and venue credentials retain their established meanings.

## Follow one market through the workspace

The venue adapter reads the provider payload, the core maps it into shared market and order-book models, and the SDK or CLI exposes those models. Use the feature matrix to check a specific operation before choosing a venue. Execution-price estimates describe the supplied order book; they do not guarantee a fill.

## Data path

```text
Venue payloads → Exchange adapters → Unified models → SDK / local API / CLI
                                          ↓
                                Execution-price estimates
```

The core normalizes venue data; the SDKs expose that shared model. Hosting and venue access still depend on the configured services. Start with local examples and public data before supplying account credentials.

### Venue adapters

This source workspace includes adapters for 15 venues. An adapter's presence does not mean every operation is supported or that the live provider is reachable. The generated [feature matrix](core/COMPLIANCE.md) lists declared methods by venue; the recorded-input checks below do not establish current live access.

<details>
<summary>Show the 15 venue names</summary>

Polymarket · Polymarket US · Kalshi · Limitless · Probable · Baozi · Myriad · Opinion · Metaculus · Smarkets · Hyperliquid · Gemini Titan · SuiBets · Rain · Hunch

</details>

## Local verification

```sh
npm run build --workspace=pmxt-core
npm run generate:sdk:typescript --workspace=pmxt-core
npm run build --workspace=pmxtjs
npm test --workspace=pmxt-core -- --runInBand test/normalizers
```

The normalizer checks use recorded inputs. Live exchange and account tests are separate and require their own environment. Publication, tagging and cross-repository synchronization are manual; no inherited automation runs from this repository.

## Licensing

The retained implementation and MarketWeave additions are covered by the [MIT project license](LICENSE) and [MIT core license](core/LICENSE). [NOTICE](NOTICE) identifies the source and separate copyright holders. Dependency notices remain in effect.
