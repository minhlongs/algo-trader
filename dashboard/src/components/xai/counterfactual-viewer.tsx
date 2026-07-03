/** @jsxImportSource react */
import { useState } from 'react';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../ui/stitch-card';
import { Button } from '../ui/button';
import type { Counterfactual } from '../../stores/xai-store';

interface CounterfactualViewerProps {
  originalFeatures: Record<string, number>;
  counterfactuals: Counterfactual[];
  onSimulate: (features: Record<string, number>, prediction: number, modelType: string) => Promise<void>;
  className?: string;
}

/**
 * Counterfactual Scenario Viewer
 *
 * Allows exploration of "what-if" scenarios by modifying feature values
 * and seeing how the prediction would change.
 */
export function CounterfactualViewer({
  originalFeatures,
  counterfactuals,
  onSimulate,
  className
}: CounterfactualViewerProps) {
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);

  const selectedCF = counterfactuals.find(cf => cf.feature === selectedFeature);
  const currentValue = selectedFeature ? originalFeatures[selectedFeature] ?? 0 : 0;

  const handleFeatureSelect = (feature: string) => {
    setSelectedFeature(feature);
    const cf = counterfactuals.find(c => c.feature === feature);
    if (cf) {
      setCustomValue(cf.counterfactualValue);
    }
  };

  const handleApplyScenario = async () => {
    if (selectedFeature) {
      setIsSimulating(true);
      try {
        const modifiedFeatures = { ...originalFeatures, [selectedFeature]: customValue };
        await onSimulate(modifiedFeatures, 0, 'rl');
      } finally {
        setIsSimulating(false);
      }
    }
  };

  const getPredictionLabel = (pred: number): string => {
    if (pred >= 0.7) return 'STRONG BUY';
    if (pred >= 0.55) return 'BUY';
    if (pred >= 0.45) return 'HOLD';
    if (pred >= 0.3) return 'SELL';
    return 'STRONG SELL';
  };

  const getPredictionColor = (pred: number): string => {
    if (pred >= 0.7) return 'text-green-400';
    if (pred >= 0.55) return 'text-emerald-400';
    if (pred >= 0.45) return 'text-yellow-400';
    if (pred >= 0.3) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <StitchCard className={className}>
      <StitchCardHeader>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-purple">🤔</span>
          What-If Scenarios
        </h3>
        <p className="text-sm text-muted-foreground">
          Explore how changing features would affect the trade decision
        </p>
      </StitchCardHeader>
      <StitchCardBody className="space-y-6">
        {/* Counterfactual list */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-accent">Suggested Changes</h4>
          {counterfactuals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No counterfactual scenarios available</p>
          ) : (
            counterfactuals.map((cf, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedFeature === cf.feature
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-muted/30 hover:border-accent/50'
                }`}
                onClick={() => handleFeatureSelect(cf.feature)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
                    {cf.feature}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${getPredictionColor(cf.wouldFlipPredictionTo)}`}>
                    → {getPredictionLabel(cf.wouldFlipPredictionTo)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{cf.description}</p>
                <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current:</span>
                    <span className="text-foreground">{cf.currentValue.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target:</span>
                    <span className="text-accent">{cf.counterfactualValue.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Change:</span>
                    <span className={`font-semibold ${cf.requiredChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {cf.requiredChange >= 0 ? '+' : ''}{cf.requiredChange.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Custom scenario builder */}
        {selectedFeature && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-purple">Custom Scenario</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{selectedFeature}</span>
                  <span className="text-accent">{customValue.toFixed(4)}</span>
                </div>
                <input
                  type="range"
                  value={customValue}
                  onChange={(e) => setCustomValue(parseFloat(e.target.value))}
                  min={Math.floor(Math.min(currentValue, customValue) * 0.8)}
                  max={Math.ceil(Math.max(currentValue, customValue) * 1.2)}
                  step={0.01}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Current: {currentValue.toFixed(4)}</span>
                  <span>Suggested: {selectedCF?.counterfactualValue.toFixed(4) ?? 'N/A'}</span>
                </div>
              </div>
              <Button
                onClick={handleApplyScenario}
                disabled={isSimulating}
                className="w-full"
                variant="primary"
              >
                {isSimulating ? 'Simulating...' : 'Simulate Change'}
              </Button>
            </div>
          </>
        )}
      </StitchCardBody>
    </StitchCard>
  );
}
