# WHALE-OS
Watch-only crypto dashboard + PAPER trading bot (simulated money, no orders, no keys).
- Paper state is kept in memory + `data/paper.json`. Render free disk is ephemeral: state resets on every deploy/restart,
  and the service sleeps after 15 min idle (the bot stops while asleep). For 24/7 paper trading, ping
  https://whale-os.onrender.com/api/state every 5-10 min with a free monitor such as UptimeRobot or cron-job.org
  (this uses free instance hours: ~750 h/month, enough for one always-on service).
- Backtest: see public/BACKTEST.md (live at /BACKTEST.md).
- Env: WHALE_USD (default 100000), FLOW_MIN (default 500000), PAPER_FILE.
