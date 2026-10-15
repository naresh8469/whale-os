WHALE-OS BACKTEST REPORT (honest, no fabricated numbers)
=========================================================
Run: 2026-10-15. Code: backtest/fetch.js + backtest/backtest.js. Raw output: backtest/results.json

STRATEGY 2: BTC/ETH whale-flow long (EMA21 filter, SL 1x ATR14, TP 2x ATR14, 5m candles)
Data: REAL OKX spot 5m candles, BTC-USDT and ETH-USDT, 52,415 candles each,
      2026-04-16 03:25 UTC -> 2026-10-15 03:15 UTC (~6 months).
      Bybit's public API returns HTTP 403 from the backtest machine, so OKX data was used
      (same pairs, prices differ by a few dollars at most).
Whale flow: there is NO free historical whale-trade feed, so a PROXY was used:
      "whale candle" = 5m candle with quote volume >= 3x the median of the previous 24h;
      buy if close>open, else sell. Signal = proxy buys over the last 1h >= 2x proxy sells,
      at least one whale candle, and close > EMA21. Entry at the next candle's open.
      If SL and TP are both inside one candle, SL is assumed (conservative).
Sizing: $1,000 start, 2% risk per trade, capped at 100% equity (no leverage),
      fees+slippage 0.1% per side.

RESULTS (with 0.1%/side costs)
 BTC-USDT : trades 2347 | win 20.6% | profit factor 0.15 | max DD 99.16% | net -99.16%  (buy&hold +8.22%)
 ETH-USDT : trades 2367 | win 28.9% | profit factor 0.26 | max DD 99.18% | net -99.18%  (buy&hold +0.39%)
 Baseline (EMA21 only, no whale filter): BTC net -97.89%, ETH net -98.11%.
 Whale threshold 5x instead of 3x: BTC -96.15%, ETH -96.19%.

DIAGNOSIS
 * Zero-cost run (diagnostic only): profit factor ~0.99-1.00, i.e. NO EDGE before fees.
   The volume proxy does not beat the EMA-only baseline.
 * 5m ATR on BTC is only ~0.1-0.2% of price, so a 0.2% round-trip cost is about 1 ATR.
   With a stop that tight, 2% risk means a 100%-equity position every trade, and costs
   kill the strategy.
 * Conclusion: as specified (5m, 1x/2x ATR), Strategy 2 LOSES MONEY. Do not trade it with real money.
   The paper bot still runs it so live (real whale-trade) behaviour can be observed, but expect losses.
   Ideas to test next: 1h candles / wider ATR multiples, maker fees, real trade-level flow.

STRATEGY 1: DEX meme momentum
 NOT BACKTESTED. The rules need historical per-pair 5m buy/sell counts, liquidity, pair age
 and GoPlus safety state at each moment. GeckoTerminal OHLCV gives price/volume only, with no buy/sell
 counts, no liquidity history and no list of the pairs that would have qualified (survivorship bias).
 Any backtest would be mostly made up, so Strategy 1 can ONLY be forward-tested with the paper bot.
