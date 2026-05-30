# Implementation Plan: WS Compression & Broadcast Optimization

## Step 1: Verification of Existing Setup and Build/Test Run
- Verify the current build and test suites to establish a baseline.
- Run `npm run build` or `npx tsc` to check if compiling passes currently.
- Run tests via `pnpm test src/api/__tests__/ws-adapter-redis.test.ts` to ensure tests run and see their status.

## Step 2: Implement WebSocket Server-side Compression
- Open `src/api/ws-adapter-redis.ts`.
- In the constructor, configure `perMessageDeflate` in the `WebSocket.Server` instantiation (lines 64-68).
- Specific configuration:
  - `perMessageDeflate`: {
      `zlibDeflateOptions`: { `level: 3`, `memLevel: 8`, `windowBits: 12` },
      `zlibInflateOptions`: { `chunkSize: 10 * 1024` },
      `clientNoContextTakeover`: true,
      `serverNoContextTakeover`: true,
      `serverMaxWindowBits`: 12,
      `concurrencyLimit`: 20,
      `threshold`: 1024
    }

## Step 3: Implement Broadcast Loop Serialization Optimization
- In `sendToClient(client: WSClient, message: any)`:
  - Check if `typeof message === 'string'`. If it is a string, send it directly to the socket (`client.ws.send(message)`).
  - Otherwise, serialize via `JSON.stringify(message)` and send.
- In `broadcastToChannel(channel: string, message: string)`:
  - Remove `const parsed = JSON.parse(message);`.
  - Pass the raw `message` string directly to `this.sendToClient(client, message)` for each subscriber connection.

## Step 4: Verify the Changes
- Run `npm run build` or `npx tsc` to ensure TypeScript compilation succeeds.
- Run `pnpm test src/api/__tests__/ws-adapter-redis.test.ts` and verify all tests pass.
- Run general integration tests if any exist.

## Step 5: Document and Final Handoff
- Update BRIEFING.md and progress.md.
- Write handoff.md detailing modified files, code changes, and test logs.
- Send message back to orchestrator.
