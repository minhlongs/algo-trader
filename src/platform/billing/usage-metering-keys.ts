/**
 * Usage Metering Redis Key Builder
 *
 * Centralizes all Redis key patterns for usage metering.
 * Extracted from usage-metering.ts for maintainability.
 */

export class UsageMeteringKeys {
  /**
   * Build base key for period usage counter
   */
  static base(licenseKey: string, period: string): string {
    return `usage:${licenseKey}:${period}`;
  }

  /**
   * Build key for trade volume tracking
   */
  static volume(licenseKey: string, period: string): string {
    return `usage:${licenseKey}:${period}:volume`;
  }

  /**
   * Build key for successful trade count
   */
  static success(licenseKey: string, period: string): string {
    return `usage:${licenseKey}:${period}:success`;
  }

  /**
   * Build key for failed trade count
   */
  static failed(licenseKey: string, period: string): string {
    return `usage:${licenseKey}:${period}:failed`;
  }

  /**
   * Build key for sync metadata hash
   */
  static sync(licenseKey: string): string {
    return `usage:${licenseKey}:sync`;
  }

  /**
   * Build pattern for scanning all license keys by period
   */
  static scanPattern(targetPeriod: string): string {
    return `usage:*:${targetPeriod}`;
  }

  /**
   * Build key for archived period data
   */
  static archive(licenseKey: string, period: string): string {
    return `usage:${licenseKey}:${period}:archive`;
  }
}