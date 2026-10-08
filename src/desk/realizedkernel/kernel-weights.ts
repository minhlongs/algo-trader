import { KernelFunctionType } from './realized-kernel-types';

export class KernelWeights {
  public static weight(type: KernelFunctionType, x: number): number {
    if (x < 0.0 || x > 1.0) return 0.0;

    if (type === 'MODIFIED_TUKEY_HANNING') {
      return (1.0 + Math.cos(Math.PI * x)) * 0.5;
    }

    // Default: Parzen Kernel
    if (x <= 0.5) {
      return 1.0 - 6.0 * x * x + 6.0 * Math.pow(x, 3);
    } else {
      return 2.0 * Math.pow(1.0 - x, 3);
    }
  }
}
