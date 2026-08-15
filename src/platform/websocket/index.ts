/**
 * WebSocket Platform Module
 * Re-exports message replay and sequence management for WS infrastructure.
 */

export { MessageReplayBuffer, type ReplayMessage } from './message-replay';
export { SequenceManager } from './sequence-manager';
