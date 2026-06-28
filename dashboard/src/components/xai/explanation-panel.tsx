/** @jsxImportSource react */
import { useState } from 'react';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../ui/stitch-card';
import { Button } from '../ui/button';

interface ExplanationPanelProps {
  explanation: {
    trade_id?: string;
    model_type?: string;
    prediction?: number;
    feature_importance?: Record<string, number>;
    shap_values?: Record<string, number> | null;
    lime_values?: Record<string, number> | null;
    rationale?: string;
    counterfactuals?: Array<{
      feature: string;
      current_value: number;
      counterfactual_value: number;
      required_change: number;
      would_flip_prediction_to: number;
      description: string;
    }>;
    confidence?: number;
    generated_at?: string;
    visualizations?: Array<{
      chart_type: string;
      data: Record<string, unknown>;
      layout?: Record<string, unknown>;
    }>;
  } | null;
}

export function ExplanationPanel({ explanation }: ExplanationPanelProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'attributions' | 'counterfactual'>('summary');

  if (!explanation) {
    return (
      <StitchCard>
        <StitchCardBody className="py-12 text-center text-muted-foreground">
          <p>No explanation available.</p>
          <p className="text-sm mt-2">Generate an explanation to see details.</p>
        </StitchCardBody>
      </StitchCard>
    );
  }

  const { prediction, rationale, feature_importance, shap_values, lime_values, counterfactuals, confidence } = explanation;

  const getAction = (pred: number): string => {
    if (pred >= 0.7) return 'STRONG BUY';
    if (pred >= 0.55) return 'BUY';
    if (pred >= 0.45) return 'HOLD';
    if (pred >= 0.3) return 'SELL';
    return 'STRONG SELL';
  };

  const getActionColor = (pred: number): string => {
    if (pred >= 0.7) return 'bg-green-500';
    if (pred >= 0.55) return 'bg-emerald-500';
    if (pred >= 0.45) return 'bg-yellow-500';
    if (pred >= 0.3) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const sortedFeatures = feature_importance
    ? Object.entries(feature_importance)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
    : [];

  const hasAttributions = shap_values && lime_values;
  const hasCounterfactuals = counterfactuals && counterfactuals.length > 0;

  return (
    <StitchCard>
      <StitchCardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-mono font-semibold text-lg">Trade Explanation</h3>
          <div className="flex items-center gap-2">
            {prediction !== undefined && (
              <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider text-white ${getActionColor(prediction)}`}>
                {getAction(prediction)}
              </span>
            )}
            {confidence !== undefined && (
              <span className="text-xs text-muted-foreground">
                Confidence: {(confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </StitchCardHeader>
      <StitchCardBody className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-3 py-1 text-xs font-mono uppercase transition-colors border-b-2 ${
              activeTab === 'summary'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('attributions')}
            className={`px-3 py-1 text-xs font-mono uppercase transition-colors border-b-2 ${
              activeTab === 'attributions'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            Attributions
            {hasAttributions && (
              <span className="ml-1 text-[10px] bg-accent/20 text-accent px-1 rounded">SHAP/LIME</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('counterfactual')}
            className={`px-3 py-1 text-xs font-mono uppercase transition-colors border-b-2 ${
              activeTab === 'counterfactual'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            What-If
            {hasCounterfactuals && (
              <span className="ml-1 text-[10px] bg-accent/20 text-accent px-1 rounded">{counterfactuals?.length}</span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {rationale && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Rationale</h4>
                <div className="p-3 bg-accent/5 border border-accent/10 rounded text-sm leading-relaxed">
                  {rationale}
                </div>
              </div>
            )}

            {explanation.trade_id && (
              <div className="text-xs text-muted-foreground">
                Trade ID: {explanation.trade_id}
                {explanation.model_type && ` • Model: ${explanation.model_type.toUpperCase()}`}
                {explanation.generated_at && ` • Generated: ${new Date(explanation.generated_at).toLocaleTimeString()}`}
              </div>
            )}

            {sortedFeatures.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Top Features</h4>
                <div className="space-y-2">
                  {sortedFeatures.map(([name, importance], idx) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-8 text-muted-foreground">#{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className="font-mono">{(importance * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${importance * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {explanation.visualizations && explanation.visualizations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Visualizations</h4>
                <p className="text-sm text-muted-foreground">
                  {explanation.visualizations.length} chart(s) available. Switch to Attributions tab to view.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'attributions' && (
          <div className="space-y-4">
            {hasAttributions ? (
              <>
                {shap_values && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">SHAP Values</h4>
                    <div className="space-y-2">
                      {Object.entries(shap_values)
                        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                        .slice(0, 10)
                        .map(([name, value]) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-24 truncate">{name}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm">
                                <span>{value.toFixed(4)}</span>
                              </div>
                              <div className="h-1 bg-muted rounded-full overflow-hidden relative">
                                <div
                                  className={`h-full absolute ${value >= 0 ? 'bg-green-500 left-0' : 'bg-red-500 right-0'}`}
                                  style={{ width: `${Math.abs(value) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {lime_values && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">LIME Values</h4>
                    <div className="space-y-2">
                      {Object.entries(lime_values)
                        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                        .slice(0, 10)
                        .map(([name, value]) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-24 truncate">{name}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm">
                                <span>{value.toFixed(4)}</span>
                              </div>
                              <div className="h-1 bg-muted rounded-full overflow-hidden relative">
                                <div
                                  className={`h-full absolute ${value >= 0 ? 'bg-blue-500 left-0' : 'bg-orange-500 right-0'}`}
                                  style={{ width: `${Math.abs(value) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No attribution data available. Generate an explanation with SHAP/LIME enabled.</p>
            )}

            {explanation.visualizations && explanation.visualizations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Charts</h4>
                <div className="space-y-4">
                  {explanation.visualizations.map((viz, idx) => (
                    <div key={idx} className="border border-border rounded p-2">
                      <p className="text-xs text-muted-foreground mb-2">{viz.chart_type} visualization</p>
                      <div className="h-64 bg-muted/20 rounded flex items-center justify-center text-muted-foreground text-sm">
                        Chart: {viz.chart_type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'counterfactual' && (
          <div className="space-y-4">
            {hasCounterfactuals ? (
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">Counterfactual scenarios show how changes would affect the prediction.</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {counterfactuals?.slice(0, 5).map((cf, idx) => (
                    <li key={idx}>
                      <span className="font-mono">{cf.feature}</span>: {cf.description}
                    </li>
                  ))}
                </ul>
                {counterfactuals && counterfactuals.length > 5 && (
                  <p className="mt-2 text-xs">...and {counterfactuals.length - 5} more scenarios</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No counterfactual scenarios available.</p>
            )}
          </div>
        )}
      </StitchCardBody>
    </StitchCard>
  );
}
