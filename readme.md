# MarketWeave

**Development history:** Developed locally before publication. These repositories were uploaded together, so their GitHub publication dates do not indicate when development began.

![MarketWeave: one interface, many markets](docs/marketweave-banner.svg)

A common interface for prediction-market data, order books, execution estimates and supported venue operations. MarketWeave brings the TypeScript core, Python SDK and command-line tools into one source workspace.

## Start with the source

```sh
git clone https://github.com/nazeeh111/MarketWeave.git
cd MarketWeave
npm ci
npm run build --workspace=pmxt-core
npm run generate:sdk:typescript --workspace=pmxt-core
npm run build --workspace=pmxtjs
```

Package names (`pmxt-core`, `pmxtjs`, `pmxt`) and command names are retained as compatibility interfaces. No new registry packages are required for this source checkout. Existing response fields, calculations, transport routes and venue credentials retain their established meanings.

## Choose an entry point

| Goal | Start here |
| --- | --- |
| Understand the components | [Architecture](ARCHITECTURE.md) |
| Integrate Python or TypeScript | [Integration reference](docs/COMPATIBILITY_GUIDE.md) |
| Explore the core API | [API reference](core/API_REFERENCE.md) |
| Use the terminal | [CLI guide](sdks/cli/README.md) |
| Work on the code | [Contribution guide](CONTRIBUTING.md) |
| Inspect preservation checks | [Compatibility notes](COMPATIBILITY.md) |

## Data path

```text
Venue payloads → Exchange adapters → Unified models → SDK / local API / CLI
                                          ↓
                                Execution-price estimates
```

The core normalizes venue data; the SDKs expose that shared model. Hosting and venue access still depend on the configured services. Start with local examples and public data before supplying account credentials.

### Supported Exchanges

<p align="center">
  <a href="https://polymarket.com" style="color: inherit; text-decoration: none;"><img src="https://polymarket.com/favicon.ico" alt="Polymarket" width="24" height="24"> <b>Polymarket</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://polymarket.us" style="color: inherit; text-decoration: none;"><img src="https://polymarket.us/favicon.ico" alt="Polymarket US" width="24" height="24"> <b>Polymarket US</b> 🇺🇸</a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://kalshi.com" style="color: inherit; text-decoration: none;"><img src="https://kalshi.com/favicon.ico" alt="Kalshi" width="24" height="24"> <b>Kalshi</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://limitless.exchange" style="color: inherit; text-decoration: none;"><img src="https://limitless.exchange/assets/images/logo.svg" alt="Limitless" width="24" height="24"> <b>Limitless</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://probable.markets" style="color: inherit; text-decoration: none;"><img src="https://developer.probable.markets/logo.svg" alt="Probable" width="100"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://baozi.bet" style="color: inherit; text-decoration: none;"><img src="https://baozi.bet/favicon.ico" alt="Baozi" width="24" height="24"> <b>Baozi</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://myriad.markets" style="color: inherit; text-decoration: none;"><img src="https://myriad.markets/favicon.ico" alt="Myriad" width="24" height="24"> <b>Myriad</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://opinion.trade" style="color: inherit; text-decoration: none;"><img src="https://app.opinion.trade/assets/apple-splash-2048-2732.jpg" alt="Opinion" width="24" height="24"> <b>Opinion</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.metaculus.com" style="color: inherit; text-decoration: none;"><img src="https://www.metaculus.com/favicon.ico" alt="Metaculus" width="24" height="24"> <b>Metaculus</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://smarkets.com" style="color: inherit; text-decoration: none;"><img src="https://smarkets.com/favicon.ico" alt="Smarkets" width="24" height="24"> <b>Smarkets</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://hyperliquid.xyz" style="color: inherit; text-decoration: none;"><img src="https://pmxt.dev/venues/hyperliquid.png" alt="Hyperliquid" width="24" height="24"> <b>Hyperliquid</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://gemini.com" style="color: inherit; text-decoration: none;"><img src="https://pmxt.dev/venues/gemini-titan.png" alt="Gemini Titan" width="24" height="24"> <b>Gemini Titan</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.suibets.com" style="color: inherit; text-decoration: none;"><img src="https://www.suibets.com/favicon.ico" alt="SuiBets" width="24" height="24"> <b>SuiBets</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://rain.one" style="color: inherit; text-decoration: none;"><img src="https://www.rain.one/favicon.png" alt="Rain" width="24" height="24"> <b>Rain</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.playhunch.xyz" style="color: inherit; text-decoration: none;"><img src="https://www.playhunch.xyz/favicon.ico" alt="Hunch" width="24" height="24"> <b>Hunch</b></a>
</p>

[Feature Support & Compliance](core/COMPLIANCE.md).


## Local verification

```sh
npm run build --workspace=pmxt-core
npm run generate:sdk:typescript --workspace=pmxt-core
npm run build --workspace=pmxtjs
npm test --workspace=pmxt-core -- --runInBand test/normalizers
```

The normalizer checks use recorded inputs. Live exchange and account tests are separate and require their own environment. Publication, tagging and cross-repository synchronization are manual; no inherited automation runs from this repository.

## Licensing

The existing [project license](LICENSE), [core license](core/LICENSE), and separate third-party notices remain in effect. Repository publication history is separate from source authorship.
