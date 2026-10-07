/**
 * Almgren-Chriss (2000) Micro-Slippage Model
 * Implements linear impact model: I = s * (v/V)^(1/2)
 * where v is trade size, V is daily volume.
 */
export class AlmgrenChrissModel {
    private readonly permanentImpact: number;
    private readonly temporaryImpact: number;

    constructor(permanentImpact: number = 0.1, temporaryImpact: number = 0.5) {
        this.permanentImpact = permanentImpact;
        this.temporaryImpact = temporaryImpact;
    }

    calculateSlippage(orderVolume: number, dailyVolume: number): number {
        if (dailyVolume <= 0) return 0;
        const participationRate = orderVolume / dailyVolume;
        return this.permanentImpact * participationRate + this.temporaryImpact * Math.sqrt(participationRate);
    }
}
