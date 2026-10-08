export interface QuadratureNode {
  readonly x: number;
  readonly w: number;
}

export class GaussLegendreQuadrature {
  // Precomputed 16 positive roots and weights for 32-point Gauss-Legendre Quadrature on [-1, 1]
  private static readonly HALF_NODES: readonly [number, number][] = [
    [0.0483076656877383, 0.0965400885147278],
    [0.1444719615827965, 0.0956387200792749],
    [0.2392873622521371, 0.0938443990808046],
    [0.3318686022821277, 0.0911738786957639],
    [0.4213512761306353, 0.0876520930044038],
    [0.5068999089322294, 0.0833119242269468],
    [0.5877157572407623, 0.0781938957870703],
    [0.6630442669302152, 0.0723486882779647],
    [0.7321821187402897, 0.0658371301205634],
    [0.7944837959679424, 0.0587271553614938],
    [0.8493676137325700, 0.0510941175618544],
    [0.8963211557660521, 0.0428703573516597],
    [0.9348946788358249, 0.0343355969014574],
    [0.9646596061801535, 0.0253839947238631],
    [0.9852664379532581, 0.0162790707141195],
    [0.9964569864287077, 0.0070186100094701],
  ];

  /**
   * Evaluates definite integral of f(x) over [a, b] using 32-point Gauss-Legendre.
   */
  public static integrate(f: (x: number) => number, a: number, b: number): number {
    const halfWidth = 0.5 * (b - a);
    const mid = 0.5 * (b + a);
    let sum = 0.0;

    for (const [xi, wi] of this.HALF_NODES) {
      const xPos = mid + halfWidth * xi;
      const xNeg = mid - halfWidth * xi;
      sum += wi * (f(xPos) + f(xNeg));
    }

    return halfWidth * sum;
  }
}
