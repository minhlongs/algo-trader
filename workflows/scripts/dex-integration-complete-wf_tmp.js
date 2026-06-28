export const meta = {
  name: 'dex-integration-complete',
  description: 'Complete DEX integration: Uniswap, PancakeSwap, SushiSwap with real-time pricing, swap execution, liquidity provision',
  phases: [
    { title: 'DEX Planning', detail: 'Design DEX abstraction, supported protocols, wallet integration' },
    { title: 'Uniswap Integration', detail: 'V2 + V3 support, pricing, swaps, liquidity' },
    { title: 'PancakeSwap & SushiSwap', detail: 'BSC and Polygon DEX adapters' },
    { title: 'Wallet Connection', detail: 'MetaMask, WalletConnect, signing' },
    { title: 'MEV Protection', detail: 'Slippage, front-running protection' },
    { title: 'Testing & Sign-off', detail: 'E2E tests, security audit, production sign-off' },
  ],
};

phase('Planning');
const planning = await agent('DEX Integration Plan', {
  label: 'dex-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan DEX integration completion. Tasks #52, #193-197.

Protocols:
- Uniswap V2 (Ethereum, Polygon, Arbitrum, Optimism)
- Uniswap V3 (concentrated liquidity)
- PancakeSwap V2 (BSC)
- SushiSwap (multi-chain)

Features:
- Token price feeds (real-time)
- Swap execution
- Liquidity provision/removal
- MEV protection

Create plan in ./plans/dex-integration/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Uniswap Integration');
const uniswap = await parallel([
  () => agent('Implement Uniswap V2 Adapter', {
    label: 'uniswap-v2-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement Uniswap V2 DEX adapter.

Features:
1. Token price: quoteAmount = reserveIn * 997 / (reserveIn + amountIn * 3)
2. Swap execution: approve → swap
3. Liquidity: add/remove LP positions
4. Multi-chain: Ethereum, Polygon, Arbitrum, Optimism

Implementation:
- src/dex/uniswap-v2.adapter.ts
- src/dex/uniswap-v2.abi.ts (contract ABIs)
- tests/dex/uniswap-v2.test.ts

Use ethers.js for contract calls.

`,
  }),
  () => agent('Implement Uniswap V3 Adapter', {
    label: 'uniswap-v3-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement Uniswap V3 DEX adapter with concentrated liquidity.

Differences from V2:
- Ticks and tick spacing
- Liquidity amount (not tokens)
- sqrtPriceX96 format
- Multi-position management

Implementation:
- src/dex/uniswap-v3.adapter.ts
- src/dex/uniswap-v3.position-manager.ts
- tests/dex/uniswap-v3.test.ts

`,
  }),
]);

phase('Other DEXes');
const otherDex = await parallel([
  () => agent('Implement PancakeSwap Adapter', {
    label: 'pancakeswap-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement PancakeSwap V2 adapter for BSC.

- Uses same ABI as Uniswap V2 (PancakeRouter)
- Different chain ID (56, 97 for testnet)
- Native token: BNB vs ETH

Files: src/dex/pancakeswap.adapter.ts, tests/dex/pancakeswap.test.ts
`,
  }),
  () => agent('Implement SushiSwap Adapter', {
    label: 'sushiswap-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement SushiSwap adapter (multi-chain).

Chains: Ethereum, Polygon, Avalanche, Arbitrum, Optimism.

Files: src/dex/sushiswap.adapter.ts, tests/dex/sushiswap.test.ts
`,
  }),
]);

phase('Wallet Integration');
const wallet = await parallel([
  () => agent('Implement Wallet Connection', {
    label: 'wallet-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement wallet connection for DEX operations.

Support:
1. MetaMask (injected provider)
2. WalletConnect (mobile)
3. Coinbase Wallet

Implementation:
- src/dex/wallet-manager.ts
- React context for wallet state (if UI)
- Signing transactions: personal_sign, eth_sendTransaction, swap execution

Files: src/dex/wallet-manager.ts, tests/dex/wallet-manager.test.ts
`,
  }),
  () => agent('Test Wallet Integration', {
    label: 'wallet-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test wallet connection:
- MetaMask connect/disconnect
- WalletConnect QR code flow
- Transaction signing
- Network switching
- Account switching
- Error: user rejection, network mismatch

`,
  }),
]);

phase('MEV Protection');
const mev = await parallel([
  () => agent('Implement MEV Protection', {
    label: 'mev-protection-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement MEV protection for DEX swaps.

Protection:
1. Slippage tolerance: max slippage parameter (default 0.5%)
2. Timeouts: deadline parameter
3. Private transactions: bundle submission (optional)
4. MEV-Share integration (if available)

Implementation in adapters: enforce slippage checks, timeout validation.

Files: src/dex/mev-protection.ts, updates to adapter swap methods.
`,
  }),
  () => agent('Test MEV Protection', {
    label: 'mev-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test MEV protection:
1. Slippage exceeded → revert
2. Deadline passed → revert
3. Price moved during execution → detect and warn
4. Front-running simulation: sandwich attack detection

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('E2E DEX Tests', {
    label: 'dex-e2e-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E tests for DEX integration on testnets:

1. Uniswap V2 on Goerli: swap ETH → USDC, verify price within 1%
2. Uniswap V3 on Goerli: add/remove concentrated liquidity
3. PancakeSwap on BSC Testnet: swap BNB → CAKE
4. Multi-hop swaps (route through intermediate token)
5. Failed transaction handling (insufficient balance, slippage)

Use test tokens from faucets.

`,
  }),
  () => agent('Security Audit', {
    label: 'dex-security',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Security audit for DEX integration:

- Reentrancy protection
- Approval security (infinite allowance)
- Token validation (fake token detection)
- Slippage enforcement
- Private key handling (no logging)

Review and sign-off.

`,
  }),
  () => agent('DEX Sign-off', {
    label: 'dex-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Final sign-off for DEX integration.

Review: all adapters, wallet, MEV protection, tests, security.

Decision: PRODUCTION or BLOCK.

`,
  }),
]);

log('DEX Integration workflow launched');