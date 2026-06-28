# WebSocket Compression Analysis and Design Proposal

## 1. Current WebSocket Configurations

### Server-side Configuration
- **File Path**: `/Users/macbook/algo-trader/src/api/ws-adapter-redis.ts`
- **Underlying Library**: `ws` (Node.js WebSocket implementation).
- **Current Initialization Options**:
  ```typescript
  this.wsServer = new WebSocket.Server({
    server: this.server,
    path: this.config.path,
    maxPayload: this.config.maxPayloadSize,
  });
  ```
- **Analysis**:
  - The server currently has WebSocket compression (`perMessageDeflate`) **disabled** (defaults to `false` when not specified in options).
  - All outgoing updates (trades, signals, orders, and market data) and incoming subscriber actions are transmitted as plain text JSON.
  - Heartbeat check runs every 30 seconds (`heartbeatIntervalMs: 30000`). If client does not reply within 60 seconds (two intervals), it terminates the socket connection.
  - On connection, a welcome message is dispatched:
    ```typescript
    this.sendToClient(client, {
      type: 'connected',
      clientId,
      channels: this.config.channels,
      timestamp: Date.now(),
    });
    ```

### Client-side Configuration (Dashboard UI)
- **File Path**: `/Users/macbook/algo-trader/dashboard/src/hooks/use-dashboard-websocket.ts`
- **Underlying API**: Browser native `WebSocket`.
- **Connection Details**:
  - Connects to `VITE_WS_URL` (or fallback to `ws://<host>/ws`).
  - On open, requests subscription:
    ```javascript
    ws.send(JSON.stringify({
      type: 'subscribe',
      channels: ['signals', 'pnl', 'admin', 'health'],
    }));
    ```
  - Standard browsers automatically negotiate `permessage-deflate` in their handshake HTTP header:
    `Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits`
  - However, because the server adapter does not support `perMessageDeflate`, the handshake returns without any compression extensions negotiated.

### Shared JS Client-side Configuration
- **File Path**: `/Users/macbook/algo-trader/src/ui/shared/ws-client.js`
- **Underlying API**: Browser native `WebSocket`.
- **Connection Details**:
  - Connects to given URL with exponential backoff reconnect and handles dots state.
  - Does not explicitly request or block any extensions (browser negotiates automatically).

---

## 2. Performance Bottlenecks & Bandwidth Concerns under High Load (5000+ VUs)

When concurrent connections surge to 5,000+ VUs:

### A. Raw Network Bandwidth Consumption
- **The Snapshot Burst Problem**: On initial connection, the client receives a full state snapshot (e.g. historical signals, current metrics). For a standard bento grid and charts, this JSON state can average **100KB**. When 5,000 users connect concurrently (e.g., during market volatility or startup), the immediate outbound spike is:
  $$\text{Burst Size} = 5,000 \times 100\text{ KB} = 500\text{ MB (transmitted in a sub-second burst)}$$
  This creates massive packet queuing, buffer overflows, and high packet drop rates, spiking p95 latency.
- **The Continuous Broadcast Overhead**: Under normal trading, the server broadcasts ticker, PnL, and signal updates to subscribers.
  - Assuming a structured update is **500 bytes**.
  - If the server broadcasts 20 updates per second:
    $$\text{Bandwidth} = 500\text{ bytes} \times 20\text{ messages/sec} \times 5,000\text{ users} \approx 50\text{ MB/sec (400 Mbps)}$$
  - If volatility surges to 100 updates/sec, it peaks at **250 MB/sec (2 Gbps)**, saturating the network card of typical VM shapes.
  - With compression enabled, raw JSON (which is highly redundant) achieves **80-90% compression ratios**, bringing bandwidth down to a highly manageable **5 - 25 MB/sec**.

### B. Redis Broadcast CPU Bottleneck (JSON.parse / JSON.stringify)
- A critical bottleneck was identified in the `RedisWSAdapter.broadcastToChannel` method:
  ```typescript
  private broadcastToChannel(channel: string, message: string): void {
    const parsed = JSON.parse(message); // <-- Parses once
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      for (const client of subscribers) {
        this.sendToClient(client, parsed); // <-- Stringifies N times!
      }
    }
  }
  ```
- If 5,000 clients are subscribed to a channel, every single message received from Redis pub/sub gets parsed once, and then `JSON.stringify` is executed **5,000 times** to send it.
- Under a load of 100 updates/sec, this triggers **500,000 stringifications per second**! This pins the Node.js event loop thread to 100% CPU, stalling p95 latency even without compression overhead.

### C. CPU Starvation from Compression (zlib context initialization)
- Enabling compression requires executing zlib deflate operations. If context takeover is enabled, zlib retains state buffers for each of the 5,000 connections.
- For 5,000 VUs, if all connections try to compress updates concurrently, Node.js's underlying libuv thread pool (default size: `UV_THREADPOOL_SIZE = 4`) will be completely starved. The tasks will queue up, causing latency spikes and socket timeouts.

### D. Memory Bloat (Out Of Memory risks)
- By default, standard WebSocket compression allocates a sliding window memory buffer for every active connection.
- If **Context Takeover** is allowed:
  - Both server and client reuse the zlib state history across messages to improve the compression ratio.
  - This allocates around **200KB - 300KB** of RAM per connection on the server.
  - For 5,000 concurrent VUs:
    $$\text{Memory Overhead} = 5,000 \times 300\text{ KB} \approx 1.5\text{ GB of RAM}$$
  - In a microservices architecture where Node instances are memory-capped (e.g., 1GB or 2GB), this will trigger an immediate **Out of Memory (OOM)** crash.

---

## 3. Recommended Settings for `permessage-deflate`

To balance network bandwidth savings with CPU/memory overhead under high load, the following settings must be tuned:

| Parameter | Recommended Value | Rationale |
|---|---|---|
| **`serverNoContextTakeover`** | `true` | **Mandatory.** Prevents the server from keeping the compression state history (sliding window) alive for each socket. This drops idle memory overhead per connection to virtually zero, saving ~1.5GB of RAM. |
| **`clientNoContextTakeover`** | `true` | Forces client browsers to drop compression history between frames, avoiding memory build-up on consumer devices. |
| **`threshold`** | `1024` (1KB) | **Critical.** Only compress messages larger than 1024 bytes. Small payloads (heartbeats, subscriptions, simple status updates) are sent uncompressed. This saves CPU from uselessly compressing tiny frames that would not shrink anyway. |
| **`level` (compression level)** | `3` or `4` | zlib compression level. Default is `zlib.constants.Z_DEFAULT_COMPRESSION` (-1, typically equivalent to level 6). Level 3/4 decreases CPU overhead by 3-4x compared to level 6/9 while preserving ~80-85% of the file reduction. |
| **`windowBits` / `serverMaxWindowBits`** | `12` (4KB window) | Decreases the sliding window size from the default `15` (32KB window) to `12` (4KB). This reduces the memory required for the active compression buffers of active transactions, reducing cache misses on the CPU. |
| **`concurrencyLimit`** | `20` | Limits the number of concurrent deflate/inflate operations. Excess requests are queued, avoiding sudden CPU spikes and thread exhaustion. |
| **`UV_THREADPOOL_SIZE`** | `16` or `32` | **Environment Variable.** Node's zlib operations execute on the libuv thread pool. The default pool size of 4 must be increased (via env var `UV_THREADPOOL_SIZE=32`) to accommodate parallel compression tasks. |

---

## 4. Code Recommendations

### Server-side Adaptation (`src/api/ws-adapter-redis.ts`)

#### A. WebSocket Server Initialization
Update the `wsServer` instantiation options inside the constructor to include `perMessageDeflate`:

```typescript
// Add imports at top if needed:
// import zlib from 'zlib';

this.wsServer = new WebSocket.Server({
  server: this.server,
  path: this.config.path,
  maxPayload: this.config.maxPayloadSize,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // Tuning deflate compression level and window bits
      level: 3,             // Level 3 balance: fast compression, low CPU
      memLevel: 8,          // Standard memory allocation for speed
      windowBits: 12,       // Lower window size to 4KB (12 bits) to save active memory
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024, // 10KB chunk size
    },
    // Context takeover configurations - MUST be true for memory efficiency
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    
    // Limits requested from/by client
    serverMaxWindowBits: 12,
    
    // Concurrency limit to prevent thread pool starvation
    concurrencyLimit: 20,
    
    // Minimum message size in bytes to apply compression
    threshold: 1024, // 1KB threshold
  },
});
```

#### B. Event Loop Broadcast Optimization
To eliminate the massive $O(N)$ stringify CPU overhead during broadcasts, optimize `sendToClient` to accept both raw string payloads and objects, and bypass redundant parsing/serialization in `broadcastToChannel`:

```typescript
  /**
   * Send message to specific client
   */
  private sendToClient(client: WSClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      // If the message is already stringified, send it directly
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      client.ws.send(payload);
    }
  }

  /**
   * Broadcast to all clients subscribed to channel
   */
  private broadcastToChannel(channel: string, message: string): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      for (const client of subscribers) {
        // Send the raw message string directly, bypassing JSON.parse and JSON.stringify loop
        this.sendToClient(client, message);
      }
    }
  }
```

---

### Client-side / React Adaptation (`dashboard/src/hooks/use-dashboard-websocket.ts`)

Browsers handle `permessage-deflate` negotiation transparently via standard headers:
`Sec-WebSocket-Extensions: permessage-deflate; client_no_context_takeover; server_no_context_takeover`

No direct adjustments to the `new WebSocket()` parameters are required, but there are two critical performance patterns to recommend for the client hook to handle high throughput without freezing client devices:

#### A. Throttled UI State Batching
Instead of dispatching React state changes on every single WebSocket frame (which triggers synchronous re-renders), batch state changes at a maximum frequency of 100ms - 200ms using a throttle queue.

```typescript
// Proposed client-side batching implementation sketch:
import { throttle } from 'lodash'; // or a simple custom throttle helper

// Within useDashboardWebSocket:
const signalQueueRef = useRef<any[]>([]);

const flushSignals = useCallback(
  throttle(() => {
    if (signalQueueRef.current.length > 0) {
      // Get the latest signals or merge them
      const latestSignals = signalQueueRef.current;
      setSignals(latestSignals);
      signalQueueRef.current = [];
    }
  }, 150), // Batch updates every 150ms
  [setSignals]
);

// Under ws.onmessage parser:
case 'signals_update':
  if (message.data) {
    signalQueueRef.current = message.data; // Queue signals
    flushSignals();
  }
  break;
```

#### B. Safe Clean Up
Ensure any open connection closes cleanly on unmount, which is already correctly configured in the current hook:
```typescript
useEffect(() => {
  mountedRef.current = true;
  connect();

  return () => {
    mountedRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };
}, [connect]);
```
