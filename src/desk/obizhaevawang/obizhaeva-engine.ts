import { ObizhaevaTransientConfig, ObizhaevaExecutionRequest, ObizhaevaOptimalSchedule } from './obizhaeva-types';
import { calculateObizhaevaSchedule } from './obizhaeva-math';

export class ObizhaevaWangEngine {
  constructor(private readonly config: ObizhaevaTransientConfig) {}

  public computeOptimalSchedule(req: ObizhaevaExecutionRequest): ObizhaevaOptimalSchedule {
    return calculateObizhaevaSchedule(req, this.config);
  }
}
