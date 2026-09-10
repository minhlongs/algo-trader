/**
 * run-experiment CLI main() — Unit Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { main } from '../run-experiment';

describe('run-experiment main()', () => {
  it('executes successfully and does not exit process on code 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      (() => {}) as unknown as (code?: string | number | null | undefined) => never,
    );
    const mockRunner = vi.fn().mockResolvedValue(0);
    await main(mockRunner);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('exits process if runner returns non-zero exit code', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      (() => {}) as unknown as (code?: string | number | null | undefined) => never,
    );
    const mockRunner = vi.fn().mockResolvedValue(1);
    await main(mockRunner);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
