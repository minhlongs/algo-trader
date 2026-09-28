import { describe, it, expect, vi } from 'vitest';
import {
  TelemetryEventBus,
  TELEMETRY_TOPICS,
} from '../../../src/desk/telemetry/telemetry-event-bus';

describe('TelemetryEventBus', () => {
  it('emits and captures events in internal history', () => {
    const bus = new TelemetryEventBus();
    bus.emit(TELEMETRY_TOPICS.PNL, { engineId: 'arbitrage', pnlUsd: 500 });
    const events = bus.getEvents(TELEMETRY_TOPICS.PNL);
    expect(events.length).toBe(1);
    expect(events[0].topic).toBe(TELEMETRY_TOPICS.PNL);
    expect(events[0].timestamp).toBeGreaterThan(0);
  });

  it('filters events by prefix correctly', () => {
    const bus = new TelemetryEventBus();
    bus.emit('desk.telemetry.snapshot', { id: 1 });
    bus.emit('desk.telemetry.alert', { id: 2 });
    bus.emit('other.topic', { id: 3 });

    expect(bus.getEvents('desk.telemetry').length).toBe(2);
    expect(bus.getEvents('desk.telemetry.alert').length).toBe(1);
    expect(bus.getEvents('unmatched').length).toBe(0);
    expect(bus.getEvents().length).toBe(3);
  });

  it('delivers events to active subscriber and unsubscribes cleanly', () => {
    const bus = new TelemetryEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('desk.telemetry.pnl', handler);

    bus.emit('desk.telemetry.pnl', { pnl: 100 });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit('desk.telemetry.pnl', { pnl: 200 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles once listener correctly', () => {
    const bus = new TelemetryEventBus();
    const handler = vi.fn();
    bus.once('desk.telemetry.alert', handler);

    bus.emit('desk.telemetry.alert', { msg: 'first' });
    bus.emit('desk.telemetry.alert', { msg: 'second' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clears event history on demand', () => {
    const bus = new TelemetryEventBus();
    bus.emit('topic1', 1);
    bus.emit('topic2', 2);
    expect(bus.getEvents().length).toBe(2);

    bus.clearEvents();
    expect(bus.getEvents().length).toBe(0);
  });

  it('forwards events to NATS publisher when configured', async () => {
    const bus = new TelemetryEventBus();
    const natsMock = vi.fn().mockResolvedValue(undefined);
    bus.setNatsPublisher(natsMock);

    bus.emit(TELEMETRY_TOPICS.SNAPSHOT, { equity: 100000 });
    expect(natsMock).toHaveBeenCalledWith(TELEMETRY_TOPICS.SNAPSHOT, { equity: 100000 });
  });

  it('safely handles NATS publisher rejection without crashing', async () => {
    const bus = new TelemetryEventBus();
    const natsMock = vi.fn().mockRejectedValue(new Error('Network error'));
    bus.setNatsPublisher(natsMock);

    expect(() => {
      bus.emit(TELEMETRY_TOPICS.ALERT, { type: 'WARN' });
    }).not.toThrow();
  });
});
