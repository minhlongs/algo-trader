# Institutional Trading Desk: Edge HFT, Continuous RL Vol Surface & MEV Shield Suite

## Architectural Blueprint & Technical Specification

This document specifies three institutional capability packages for the `algo-trader` desk:

1. **Package 1: Edge HFT Gateway & Stream Multiplexer** (`src/desk/edge/`)
   - `EdgeOrderRouter`: Low-latency geographic routing engine evaluating round-trip latency (RTT), routing orders to optimal colocation clusters (Tokyo, Frankfurt, Virginia).
   - `WsStreamMultiplexer`: Resilient multi-venue WebSocket stream multiplexer with sequence gap detection, adaptive ping-pong jitter, and zero-loss circular backpressure buffer.
   - `MicrosecondCircuitBreaker`: Sub-millisecond hierarchical kill-switch (L0 to L4) reacting to exchange packet drops, abnormal rejection surges, and latency spikes.

2. **Package 2: Continuous RL & Dynamic Volatility Surface** (`src/desk/rl/`)
   - `ContinuousPolicyAgent`: Actor-Critic continuous action policy engine (PPO-style clip objective) evaluating state representations of order book depth, Kyle's lambda, and VPIN toxicity with differential Sharpe reward.
   - `SabrVolSurfaceCalibrator`: Real-time Stochastic Alpha Beta Rho (SABR) and SVI volatility surface model calibrating implied volatility smiles across strike prices and tenors.
   - `RegimeJumpDiffusionFilter`: Real-time Markov regime-switching filter detecting structural jumps and transition probabilities between low-vol and high-vol crisis regimes.

3. **Package 3: Institutional MEV Shield & JIT Liquidity Sentinel** (`src/desk/mev/`)
   - `PrivateMempoolBundleRelayer`: Flashbots/Eden-style private transaction builder and bundle relayer that bypasses public mempools, preventing front-running and sandwiching.
   - `JitLiquidityProvisioner`: Just-in-Time concentrated liquidity optimizer that mints temporary tick-range liquidity ahead of large informed swaps and burns it immediately post-swap to earn fees with minimal inventory exposure.
   - `ToxicLvrInterceptor`: Cross-venue arbitrage capture engine that identifies unhedged AMM pools and neutralizes toxic Loss-Versus-Rebalancing (LVR) arbitrage by external searchers.

## Invariants & Design Principles
- Every file in `src/` must be $\le 200$ LOC.
- Strict TypeScript: 0 `:any` types, 0 `eslint-disable` comments.
- 100% green tests in Vitest with deterministic assertions.
