// @ts-nocheck
import { useState, useEffect } from 'react';
import { useXAI } from '../hooks/use-xai';
import { ExplanationPanel } from '../components/xai/explanation-panel';
import { FeatureImportanceChart } from '../components/xai/feature-importance-chart';
import { CounterfactualViewer } from '../components/xai/counterfactual-viewer';
import { StrategyRulesViewer } from '../components/xai/strategy-rules-viewer';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../components/ui/stitch-card';
import { Button } from '../components/ui/button';
import { StitchBadge } from '../components/ui/stitch-badge';
import { AlertCircle, Brain, BarChart3, GitBranch, Lightbulb } from 'lucide-react';

export function XAIDashboardPage() {
  const {
    explanations,
    currentExplanation,
    selectedTradeId,
    strategyRules,
    isLoading,
    error,
    explainPrediction,
    fetchExplanation,
    fetchFeatureImportance,
    generateCounterfactuals,
    extractStrategyRules,
    selectTrade,
    clearError,
  } = useXAI();

  const [selectedModelType, setSelectedModelType] = useState<'rl' | 'kronos' | 'strategy'>('rl');
  const [featureImportanceData, setFeatureImportanceData] = useState<Array<{ name: string; importance: number }>>([]);
  const [strategyCode, setStrategyCode] = useState<string>('');
  const [selectedStrategyName, setSelectedStrategyName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('explain');

  // Load feature importance on mount and when model type changes
  useEffect(() => {
    const loadFeatureImportance = async () => {
      try {
        const response = await fetchFeatureImportance(selectedModelType, 15);
        setFeatureImportanceData(response.features);
      } catch (err) {
        console.error('Failed to load feature importance:', err);
      }
    };

    loadFeatureImportance();
  }, [selectedModelType, fetchFeatureImportance]);

  // Extract strategy rules when strategy code changes
  const handleExtractRules = async () => {
    if (!strategyCode.trim()) return;

    try {
      await extractStrategyRules({
        strategy_code: strategyCode,
        strategy_name: selectedStrategyName || 'CustomStrategy',
        use_llm: true,
      });
    } catch (err) {
      console.error('Failed to extract strategy rules:', err);
    }
  };

  // Example feature data for quick testing
  const exampleFeatures = {
    RSI: 25.0,
    MACD: 0.001,
    Volume: 1000000,
    Bollinger_Upper: 150.5,
    Bollinger_Lower: 145.2,
    Price_Change_24h: 2.5,
    Volatility: 0.15,
    Sentiment_Score: 0.67,
  };

  const handleQuickExplain = async () => {
    try {
      await explainPrediction({
        model_type: selectedModelType,
        features: exampleFeatures,
        trade_id: `quick_${Date.now()}`,
        generate_visualizations: true,
      });
    } catch (err) {
      console.error('Failed to generate explanation:', err);
    }
  };

  const tabs = [
    { id: 'explain', label: 'Explain', icon: Lightbulb },
    { id: 'features', label: 'Feature Importance', icon: BarChart3 },
    { id: 'counterfactual', label: 'What-If Scenarios', icon: GitBranch },
    { id: 'rules', label: 'Strategy Rules', icon: Brain },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">XAI Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Explainable AI insights for trading decisions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
            <Brain className="h-3 w-3" />
            SHAP & LIME
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
            <BarChart3 className="h-3 w-3" />
            Visualizations
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-sm hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors border-b-2 min-h-touch ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'explain' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ExplanationPanel explanation={currentExplanation} />
          </div>

          <div className="space-y-4">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Quick Test</h3>
              </StitchCardHeader>
              <StitchCardBody className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model Type</label>
                  <select
                    value={selectedModelType}
                    onChange={(e) => setSelectedModelType(e.target.value as 'rl' | 'kronos' | 'strategy')}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-accent/70"
                    style={{
                      backgroundColor: 'var(--colors-surface)',
                      borderColor: 'var(--colors-outline)',
                      color: 'var(--colors-onSurface)',
                    }}
                  >
                    <option value="rl">RL Model</option>
                    <option value="kronos">Kronos</option>
                    <option value="strategy">Strategy</option>
                  </select>
                </div>

                <div className="p-3 bg-white/5 rounded-md border border-white/10">
                  <p className="text-xs text-muted-foreground mb-2">Example features:</p>
                  <pre className="text-xs overflow-auto text-white/70">
                    {JSON.stringify(exampleFeatures, null, 2)}
                  </pre>
                </div>

                <Button
                  onClick={handleQuickExplain}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Generating...' : 'Generate Explanation'}
                </Button>

                <p className="text-xs text-muted-foreground">
                  This will generate SHAP/LIME explanations and rationale for the example features.
                </p>
              </StitchCardBody>
            </StitchCard>

            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Recent Explanations</h3>
              </StitchCardHeader>
              <StitchCardBody>
                {explanations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No explanations generated yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {explanations.slice(-5).reverse().map((exp) => (
                      <button
                        key={exp.id}
                        onClick={() => fetchExplanation(exp.id)}
                        className="w-full text-left px-3 py-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-xs">{exp.tradeId}</span>
                          <span className="text-xs text-muted-foreground">
                            {exp.modelType} - {(exp.prediction * 100).toFixed(1)}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </StitchCardBody>
            </StitchCard>
          </div>
        </div>
      )}

      {activeTab === 'features' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Feature Importance</h3>
              </StitchCardHeader>
              <StitchCardBody>
                {featureImportanceData.length > 0 ? (
                  <FeatureImportanceChart
                    data={featureImportanceData}
                    title={`Top Features - ${selectedModelType.toUpperCase()}`}
                    height={400}
                  />
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    {isLoading ? 'Loading...' : 'No feature importance data available'}
                  </div>
                )}
              </StitchCardBody>
            </StitchCard>
          </div>

          <div className="space-y-4">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Model Selection</h3>
              </StitchCardHeader>
              <StitchCardBody className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model Type</label>
                  <select
                    value={selectedModelType}
                    onChange={(e) => setSelectedModelType(e.target.value as 'rl' | 'kronos' | 'strategy')}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:border-accent/70"
                    style={{
                      backgroundColor: 'var(--colors-surface)',
                      borderColor: 'var(--colors-outline)',
                      color: 'var(--colors-onSurface)',
                    }}
                  >
                    <option value="rl">RL Model</option>
                    <option value="kronos">Kronos</option>
                    <option value="strategy">Strategy</option>
                  </select>
                </div>

                <p className="text-xs text-muted-foreground">
                  Feature importance is aggregated across all predictions for the selected model.
                  Features are ranked by their average impact on predictions.
                </p>
              </StitchCardBody>
            </StitchCard>

            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Top Features</h3>
              </StitchCardHeader>
              <StitchCardBody>
                {featureImportanceData.length > 0 ? (
                  <div className="space-y-2">
                    {featureImportanceData.slice(0, 10).map((feature, idx) => (
                      <div key={feature.name} className="flex items-center gap-2">
                        <span className="text-xs w-8 text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>{feature.name}</span>
                            <span className="font-mono">
                              {(feature.importance * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${feature.importance * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </StitchCardBody>
            </StitchCard>
          </div>
        </div>
      )}

      {activeTab === 'counterfactual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">What-If Analysis</h3>
              </StitchCardHeader>
              <StitchCardBody>
                {currentExplanation ? (
                  <CounterfactualViewer
                    counterfactuals={currentExplanation.counterfactuals || []}
                    currentFeatures={currentExplanation.feature_importance}
                    onSimulate={generateCounterfactuals}
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground border rounded-lg bg-white/5">
                    <div className="text-center">
                      <p className="mb-2">No explanation selected</p>
                      <p className="text-sm">
                        Generate an explanation first to see counterfactual scenarios
                      </p>
                    </div>
                  </div>
                )}
              </StitchCardBody>
            </StitchCard>
          </div>

          <div className="space-y-4">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">About Counterfactuals</h3>
              </StitchCardHeader>
              <StitchCardBody>
                <p className="text-sm text-muted-foreground">
                  Counterfactual explanations show what minimal changes would flip the model's
                  prediction. For example: "If RSI were 15 points higher, the trade would be
                  a HOLD instead of a BUY."
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>Explore alternative scenarios</li>
                  <li>Understand decision boundaries</li>
                  <li>Identify key leverage points</li>
                  <li>Test risk factors</li>
                </ul>
              </StitchCardBody>
            </StitchCard>

            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">How to Use</h3>
              </StitchCardHeader>
              <StitchCardBody className="space-y-2 text-sm text-muted-foreground">
                <p>1. Generate an explanation for a trade</p>
                <p>2. View suggested counterfactual changes</p>
                <p>3. Adjust values with sliders to simulate</p>
                <p>4. See how prediction would change</p>
              </StitchCardBody>
            </StitchCard>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Extracted Strategy Rules</h3>
              </StitchCardHeader>
              <StitchCardBody>
                <StrategyRulesViewer rules={strategyRules} />
              </StitchCardBody>
            </StitchCard>
          </div>

          <div className="space-y-4">
            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">Extract Rules</h3>
              </StitchCardHeader>
              <StitchCardBody className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Strategy Name</label>
                  <input
                    type="text"
                    value={selectedStrategyName}
                    onChange={(e) => setSelectedStrategyName(e.target.value)}
                    placeholder="MyTradingStrategy"
                    className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-accent/70 transition-colors"
                    style={{
                      backgroundColor: 'var(--colors-surface)',
                      borderColor: 'var(--colors-outline)',
                      color: 'var(--colors-onSurface)',
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Strategy Code</label>
                  <textarea
                    value={strategyCode}
                    onChange={(e) => setStrategyCode(e.target.value)}
                    placeholder="Paste your strategy code here..."
                    rows={10}
                    className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-accent/70 transition-colors resize-y"
                    style={{
                      backgroundColor: 'var(--colors-surface)',
                      borderColor: 'var(--colors-outline)',
                      color: 'var(--colors-onSurface)',
                    }}
                  />
                </div>

                <Button
                  onClick={handleExtractRules}
                  disabled={!strategyCode.trim() || isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Extracting...' : 'Extract Rules'}
                </Button>

                <p className="text-xs text-muted-foreground">
                  Extracts human-readable trading rules from code using pattern matching and
                  LLM analysis. Supports Python and pseudocode.
                </p>
              </StitchCardBody>
            </StitchCard>

            <StitchCard>
              <StitchCardHeader>
                <h3 className="font-semibold">About Rule Extraction</h3>
              </StitchCardHeader>
              <StitchCardBody>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically parse strategy code to understand the decision logic.
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                  <li>Detects technical indicators (RSI, MACD, etc.)</li>
                  <li>Extracts buy/sell/hold conditions</li>
                  <li>Generates natural language descriptions</li>
                  <li>Shows line numbers for traceability</li>
                </ul>
              </StitchCardBody>
            </StitchCard>
          </div>
        </div>
      )}
    </div>
  );
}
