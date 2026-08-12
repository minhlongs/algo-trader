# Task

Enforce OmniRoute in `src/lib/llm-router.ts`.

All LLM traffic from `LlmRouter` must resolve through the OmniRoute gateway
(`http://omnimbp.local:20128/v1`, mDNS LAN address on the M1 Max host) or an
explicit loopback address (localhost/127.0.0.1/0.0.0.0, for legacy
bare-metal-port test fixtures). Any endpoint URL that is neither must cause a
hard failure at `LlmRouter` construction time, not a silent fallback.

Source package: algo-trader at `/Users/macbook/algo-trader`
