/**
 * Wave 213: Cartea & Jaimungal (2014) Riccati & Math Core
 * Strictly < 50 LOC, zero :any.
 */

export function calculateRiccatiCoefficient(
  phi: number,
  alphaTerm: number,
  remainingTime: number
): number {
  const sqrtPhi = Math.sqrt(Math.max(1e-8, phi));
  const arg = sqrtPhi * Math.max(0.0001, remainingTime);
  const coshArg = Math.cosh(Math.min(20.0, arg));
  const sinhArg = Math.sinh(Math.min(20.0, arg));

  const num = alphaTerm * coshArg + sqrtPhi * sinhArg;
  const den = sqrtPhi * coshArg + alphaTerm * sinhArg;
  return sqrtPhi * (num / Math.max(1e-8, den));
}
