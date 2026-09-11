/**
 * Cross-Platform Arbitrage Detector — Barrel Facade
 *
 * Previously a monolithic 298-LOC file. Extracted into two focused submodules:
 * - cross-platform-arb-types.ts    — PlatformPrice, ArbOpportunity, ArbConfig interfaces
 * - cross-platform-arb-detector.ts — CrossPlatformArbDetector class + singleton factory
 */

export type { PlatformPrice, ArbOpportunity, ArbConfig } from './cross-platform-arb-types';
export { CrossPlatformArbDetector, getCrossPlatformArbDetector } from './cross-platform-arb-detector';
