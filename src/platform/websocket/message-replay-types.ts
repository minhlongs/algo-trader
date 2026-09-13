export interface ReplayMessage {
  seq: number;
  channel: string;
  payload: string;
  timestamp: number;
}

export interface MessageReplayConfig {
  /** Max messages to retain per channel (sorted set cap) */
  maxBufferPerChannel: number;
  /** TTL in seconds for buffered messages */
  bufferTtlSeconds: number;
}

export const DEFAULT_CONFIG: MessageReplayConfig = {
  maxBufferPerChannel: 1000,
  bufferTtlSeconds: 300, // 5 minutes
};
