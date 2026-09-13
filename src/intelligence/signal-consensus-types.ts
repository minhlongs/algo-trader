export interface SwarmVote {
  persona: 'risk-analyst' | 'momentum-trader' | 'contrarian' | 'quantitative-analyst';
  vote: 'APPROVE' | 'REJECT';
  confidence: number; // 0-1
  reasoning: string;
}

export interface SwarmConsensus {
  approved: boolean;
  votes: SwarmVote[];
  consensusConfidence: number;
  dissent: string | null;
}

export interface PersonaConfig {
  id: 'risk-analyst' | 'momentum-trader' | 'contrarian' | 'quantitative-analyst';
  name: string;
  systemPrompt: string;
  model?: string;
}

export const BASE_PERSONAS: PersonaConfig[] = [
  {
    id: 'risk-analyst',
    name: 'Risk Analyst',
    systemPrompt: 'You are a risk analyst evaluating a trading signal. Focus on downside risk, tail events, and capital preservation. Be strict and conservative.',
  },
  {
    id: 'momentum-trader',
    name: 'Momentum Trader',
    systemPrompt: 'You are a momentum trader. Focus on price trends, volume patterns, and momentum indicators. Be aggressive when signals are strong.',
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    systemPrompt: 'You are a contrarian analyst. Question assumptions, look for hidden risks, and challenge the majority view. Always play devil\'s advocate.',
  },
];

export const QWEN_PERSONA: PersonaConfig = {
  id: 'quantitative-analyst',
  name: 'Quantitative Analyst',
  systemPrompt: 'You are a quantitative analyst using statistical models to validate trading signals. Focus on expected value, probability distributions, and mathematical rigor.',
  model: 'qwen',
};

export function getSwarmPersonas(): PersonaConfig[] {
  const personas = [...BASE_PERSONAS];
  if (process.env.SWARM_QWEN_ENABLED === 'true') {
    personas.push(QWEN_PERSONA);
  }
  return personas;
}

export const PERSONAS: PersonaConfig[] = getSwarmPersonas();
