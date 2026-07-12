// @ts-nocheck
import { useState, useEffect } from 'react';
import { useXAI } from '../hooks/use-xai';
import { ExplanationPanel } from '../components/xai/explanation-panel';
import { FeatureImportanceChart } from '../components/xai/feature-importance-chart';
import { CounterfactualViewer } from '../components/xai/counterfactual-viewer';
import { StrategyRulesViewer } from '../components/xai/strategy-rules-viewer';
import { Button } from '../components/ui/button';
import { COLORS } from '../lib/stitch-design-tokens';
import {
  AlertCircle,
  Brain,
  BarChart3,
  GitBranch,
  Lightbulb,
} from 'lucide-react';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggleEn: 'VI',
    langToggleVi: 'EN',
    title: 'XAI Dashboard',
    subtitle: 'Explainable AI insights for trading decisions',
    badgeShapLime: 'SHAP & LIME',
    badgeVisualizations: 'Visualizations',
    tabExplain: 'Explain',
    tabFeatures: 'Feature Importance',
    tabCounterfactual: 'What-If Scenarios',
    tabRules: 'Strategy Rules',
    quickTest: 'Quick Test',
    labelModelType: 'Model Type',
    optionRL: 'RL Model',
    optionKronos: 'Kronos',
    optionStrategy: 'Strategy',
    labelExampleFeatures: 'Example features:',
    btnGenerate: 'Generate Explanation',
    btnGenerating: 'Generating...',
    hintExplanation: 'Generates SHAP/LIME explanations and rationale for the example features.',
    recentExplanations: 'Recent Explanations',
    noExplanations: 'No explanations generated yet.',
    featureImportance: 'Feature Importance',
    loading: 'Loading...',
    noFeatureData: 'No feature importance data available',
    modelSelection: 'Model Selection',
    featureAggregationHint: 'Feature importance is aggregated across all predictions for the selected model. Features are ranked by their average impact on predictions.',
    topFeatures: 'Top Features',
    noData: 'No data',
    whatIfAnalysis: 'What-If Analysis',
    noExplanationSelected: 'No explanation selected',
    generateFirst: 'Generate an explanation first to see counterfactual scenarios.',
    aboutCounterfactuals: 'About Counterfactuals',
    counterfactualDescription:
      'Counterfactual explanations show what minimal changes would flip the model\'s prediction. For example: "If RSI were 15 points higher, the trade would be a HOLD instead of a BUY."',
    exploreScenarios: 'Explore alternative scenarios',
    understandBoundaries: 'Understand decision boundaries',
    identifyLeverage: 'Identify key leverage points',
    testRiskFactors: 'Test risk factors',
    howToUse: 'How to Use',
    step1: 'Generate an explanation for a trade',
    step2: 'View suggested counterfactual changes',
    step3: 'Adjust values with sliders to simulate',
    step4: 'See how prediction would change',
    extractRules: 'Extract Rules',
    labelStrategyName: 'Strategy Name',
    placeholderStrategyName: 'MyTradingStrategy',
    labelStrategyCode: 'Strategy Code',
    placeholderStrategyCode: 'Paste your strategy code here...',
    btnExtract: 'Extract Rules',
    btnExtracting: 'Extracting...',
    extractionHint: 'Extracts human-readable trading rules from code using pattern matching and LLM analysis. Supports Python and pseudocode.',
    extractedRules: 'Extracted Strategy Rules',
    aboutRuleExtraction: 'About Rule Extraction',
    ruleExtractionDescription: 'Automatically parse strategy code to understand the decision logic.',
    detectIndicators: 'Detects technical indicators (RSI, MACD, etc.)',
    extractConditions: 'Extracts buy/sell/hold conditions',
    generateDescriptions: 'Generates natural language descriptions',
    showLineNumbers: 'Shows line numbers for traceability',
    dismiss: 'Dismiss',
  },
  vi: {
    langToggleEn: 'EN',
    langToggleVi: 'VI',
    title: 'Bảng Điều Khiển XAI',
    subtitle: 'Thông tin AI có thể giải thích cho quyết định giao dịch',
    badgeShapLime: 'SHAP & LIME',
    badgeVisualizations: 'Trực Quan Hóa',
    tabExplain: 'Giải Thích',
    tabFeatures: 'Tầm Quan Trọng Đặc Trưng',
    tabCounterfactual: 'Kịch Bản What-If',
    tabRules: 'Quy Tắc Chiến Lược',
    quickTest: 'Thử Nhanh',
    labelModelType: 'Loại Mô Hình',
    optionRL: 'Mô Hình RL',
    optionKronos: 'Kronos',
    optionStrategy: 'Chiến Lược',
    labelExampleFeatures: 'Đặc trưng ví dụ:',
    btnGenerate: 'Tạo Giải Thích',
    btnGenerating: 'Đang tạo...',
    hintExplanation: 'Tạo giải thích SHAP/LIME và lý do cho các đặc trưng ví dụ.',
    recentExplanations: 'Giải Thích Gần Đây',
    noExplanations: 'Chưa có giải thích nào được tạo.',
    featureImportance: 'Tầm Quan Trọng Đặc Trưng',
    loading: 'Đang tải...',
    noFeatureData: 'Không có dữ liệu tầm quan trọng đặc trưng',
    modelSelection: 'Chọn Mô Hình',
    featureAggregationHint: 'Tầm quan trọng đặc trưng được tổng hợp trên tất cả dự đoán của mô hình đã chọn. Các đặc trưng được xếp hạng theo mức ảnh hưởng trung bình.',
    topFeatures: 'Đặc Trưng Hàng Đầu',
    noData: 'Không có dữ liệu',
    whatIfAnalysis: 'Phân Tích What-If',
    noExplanationSelected: 'Chưa chọn giải thích',
    generateFirst: 'Tạo giải thích trước để xem kịch bản counterfactual.',
    aboutCounterfactuals: 'Về Counterfactuals',
    counterfactualDescription:
      'Giải thích counterfactual cho biết thay đổi tối thiểu nào sẽ đảo ngược dự đoán của mô hình. Ví dụ: "Nếu RSI cao hơn 15 điểm, giao dịch sẽ là HOLD thay vì BUY."',
    exploreScenarios: 'Khám phá kịch bản thay thế',
    understandBoundaries: 'Hiểu ranh giới quyết định',
    identifyLeverage: 'Xác định điểm mấu chốt',
    testRiskFactors: 'Kiểm tra yếu tố rủi ro',
    howToUse: 'Cách Sử Dụng',
    step1: 'Tạo giải thích cho một giao dịch',
    step2: 'Xem các thay đổi counterfactual được đề xuất',
    step3: 'Điều chỉnh giá trị với thanh trượt để mô phỏng',
    step4: 'Xem dự đoán sẽ thay đổi như thế nào',
    extractRules: 'Trích Xuất Quy Tắc',
    labelStrategyName: 'Tên Chiến Lược',
    placeholderStrategyName: 'ChiếnLượcGiaoDịch',
    labelStrategyCode: 'Mã Chiến Lược',
    placeholderStrategyCode: 'Dán mã chiến lược của bạn vào đây...',
    btnExtract: 'Trích Xuất Quy Tắc',
    btnExtracting: 'Đang trích xuất...',
    extractionHint: 'Trích xuất quy tắc giao dịch có thể đọc được từ mã bằng khớp mẫu và phân tích LLM. Hỗ trợ Python và mã giả.',
    extractedRules: 'Quy Tắc Chiến Lược Đã Trích Xuất',
    aboutRuleExtraction: 'Về Trích Xuất Quy Tắc',
    ruleExtractionDescription: 'Phân tích tự động mã chiến lược để hiểu logic quyết định.',
    detectIndicators: 'Phát hiện chỉ báo kỹ thuật (RSI, MACD, v.v.)',
    extractConditions: 'Trích xuất điều kiện mua/bán/giữ',
    generateDescriptions: 'Tạo mô tả bằng ngôn ngữ tự nhiên',
    showLineNumbers: 'Hiển thị số dòng để truy xuất',
    dismiss: 'Đóng',
  },
};

export function XAIDashboardPage() {
  const {
    explanations,
    currentExplanation,
    strategyRules,
    isLoading,
    error,
    explainPrediction,
    fetchExplanation,
    fetchFeatureImportance,
    generateCounterfactuals,
    extractStrategyRules,
    clearError,
  } = useXAI();

  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const [selectedModelType, setSelectedModelType] = useState<'rl' | 'kronos' | 'strategy'>('rl');
  const [featureImportanceData, setFeatureImportanceData] = useState<
    Array<{ name: string; importance: number }>
  >([]);
  const [strategyCode, setStrategyCode] = useState<string>('');
  const [selectedStrategyName, setSelectedStrategyName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('explain');

  useEffect(() => {
    loadFeatureImportance();
  }, [selectedModelType, fetchFeatureImportance]);

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

  const loadFeatureImportance = async () => {
    try {
      const response = await fetchFeatureImportance(selectedModelType, 15);
      setFeatureImportanceData(response.features);
    } catch {
      // silent fail — feature importance is non-blocking
    }
  };

  const handleQuickExplain = async () => {
    try {
      await explainPrediction({
        model_type: selectedModelType,
        features: exampleFeatures,
        trade_id: `quick_${Date.now()}`,
        generate_visualizations: true,
      });
    } catch {
      // handled by error display
    }
  };

  const handleExtractRules = async () => {
    if (!strategyCode.trim()) return;
    try {
      await extractStrategyRules({
        strategy_code: strategyCode,
        strategy_name: selectedStrategyName || 'CustomStrategy',
        use_llm: true,
      });
    } catch {
      // handled by error display
    }
  };

  const tabs: { id: string; labelKey: string; icon: typeof Lightbulb }[] = [
    { id: 'explain', labelKey: 'tabExplain', icon: Lightbulb },
    { id: 'features', labelKey: 'tabFeatures', icon: BarChart3 },
    { id: 'counterfactual', labelKey: 'tabCounterfactual', icon: GitBranch },
    { id: 'rules', labelKey: 'tabRules', icon: Brain },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Language Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
          className="p-2 rounded-full transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.outline}`,
            color: COLORS.primary,
          }}
          aria-label={`Switch to ${lang === 'en' ? 'Vietnamese' : 'English'}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ color: COLORS.primary }}
            >
              {t.title}
            </h1>
            <p className="mt-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${COLORS.primaryContainer}15`,
                color: COLORS.primary,
                border: `1px solid ${COLORS.primaryContainer}30`,
              }}
            >
              <Brain className="h-3 w-3" />
              {t.badgeShapLime}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${COLORS.primaryContainer}15`,
                color: COLORS.primary,
                border: `1px solid ${COLORS.primaryContainer}30`,
              }}
            >
              <BarChart3 className="h-3 w-3" />
              {t.badgeVisualizations}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="p-4 rounded-lg flex items-center justify-between"
            style={{
              backgroundColor: `${COLORS.loss}10`,
              border: `1px solid ${COLORS.loss}40`,
              color: COLORS.loss,
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-sm underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
            >
              {t.dismiss}
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b pb-2" style={{ borderColor: `${COLORS.primary}20` }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2 text-sm transition-all border-b-2"
                style={{
                  borderColor: isActive ? COLORS.primaryContainer : 'transparent',
                  color: isActive ? COLORS.primary : COLORS.onSurfaceVariant,
                }}
              >
                <Icon className="h-4 w-4" />
                {t[tab.labelKey]}
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
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.quickTest}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.labelModelType}
                    </label>
                    <select
                      value={selectedModelType}
                      onChange={(e) =>
                        setSelectedModelType(e.target.value as 'rl' | 'kronos' | 'strategy')
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors"
                      style={{
                        backgroundColor: COLORS.surface,
                        borderColor: COLORS.outline,
                        color: COLORS.onSurface,
                      }}
                    >
                      <option value="rl">{t.optionRL}</option>
                      <option value="kronos">{t.optionKronos}</option>
                      <option value="strategy">{t.optionStrategy}</option>
                    </select>
                  </div>

                  <div
                    className="p-3 rounded-md border"
                    style={{ backgroundColor: `${COLORS.primary}08`, borderColor: `${COLORS.primary}15` }}
                  >
                    <p
                      className="text-xs mb-2"
                      style={{ color: COLORS.onSurfaceVariant }}
                    >
                      {t.labelExampleFeatures}
                    </p>
                    <pre
                      className="text-xs overflow-auto"
                      style={{ color: `${COLORS.onSurface}99` }}
                    >
                      {JSON.stringify(exampleFeatures, null, 2)}
                    </pre>
                  </div>

                  <Button
                    onClick={handleQuickExplain}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? t.btnGenerating : t.btnGenerate}
                  </Button>

                  <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    {t.hintExplanation}
                  </p>
                </div>
              </div>

              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.recentExplanations}
                  </h3>
                </div>
                <div className="p-4">
                  {explanations.length === 0 ? (
                    <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.noExplanations}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {explanations.slice(-5).reverse().map((exp) => (
                        <button
                          key={exp.id}
                          onClick={() => fetchExplanation(exp.id)}
                          className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                          style={{
                            backgroundColor: `${COLORS.primary}08`,
                            border: `1px solid ${COLORS.outline}40`,
                          }}
                        >
                          <div className="flex flex-col items-start">
                            <span
                              className="text-xs font-mono"
                              style={{ color: COLORS.primary }}
                            >
                              {exp.tradeId}
                            </span>
                            <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                              {exp.modelType} - {(exp.prediction * 100).toFixed(1)}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.featureImportance}
                  </h3>
                </div>
                <div className="p-4">
                  {featureImportanceData.length > 0 ? (
                    <FeatureImportanceChart
                      data={featureImportanceData}
                      title={`Top Features - ${selectedModelType.toUpperCase()}`}
                      height={400}
                    />
                  ) : (
                    <div
                      className="h-[400px] flex items-center justify-center"
                      style={{ color: COLORS.onSurfaceVariant }}
                    >
                      {isLoading ? t.loading : t.noFeatureData}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.modelSelection}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.labelModelType}
                    </label>
                    <select
                      value={selectedModelType}
                      onChange={(e) =>
                        setSelectedModelType(e.target.value as 'rl' | 'kronos' | 'strategy')
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors"
                      style={{
                        backgroundColor: COLORS.surface,
                        borderColor: COLORS.outline,
                        color: COLORS.onSurface,
                      }}
                    >
                      <option value="rl">{t.optionRL}</option>
                      <option value="kronos">{t.optionKronos}</option>
                      <option value="strategy">{t.optionStrategy}</option>
                    </select>
                  </div>

                  <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    {t.featureAggregationHint}
                  </p>
                </div>
              </div>

              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.topFeatures}
                  </h3>
                </div>
                <div className="p-4">
                  {featureImportanceData.length > 0 ? (
                    <div className="space-y-3">
                      {featureImportanceData.slice(0, 10).map((feature, idx) => (
                        <div key={feature.name} className="flex items-center gap-3">
                          <span
                            className="text-xs font-mono w-6 text-right"
                            style={{ color: COLORS.onSurfaceVariant }}
                          >
                            #{idx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span style={{ color: COLORS.onSurface }}>{feature.name}</span>
                              <span className="font-mono" style={{ color: COLORS.primary }}>
                                {(feature.importance * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div
                              className="h-1 rounded-full overflow-hidden"
                              style={{ backgroundColor: COLORS.outline }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${feature.importance * 100}%`,
                                  backgroundColor: COLORS.primaryContainer,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.noData}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'counterfactual' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.whatIfAnalysis}
                  </h3>
                </div>
                <div className="p-4">
                  {currentExplanation ? (
                    <CounterfactualViewer
                      counterfactuals={currentExplanation.counterfactuals || []}
                      currentFeatures={currentExplanation.feature_importance}
                      onSimulate={generateCounterfactuals}
                    />
                  ) : (
                    <div
                      className="h-64 flex items-center justify-center rounded-lg border"
                      style={{
                        backgroundColor: `${COLORS.primary}08`,
                        borderColor: `${COLORS.outline}50`,
                      }}
                    >
                      <div className="text-center">
                        <p className="mb-2" style={{ color: COLORS.onSurfaceVariant }}>
                          {t.noExplanationSelected}
                        </p>
                        <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>
                          {t.generateFirst}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.aboutCounterfactuals}
                  </h3>
                </div>
                <div className="p-4">
                  <p className="text-sm mb-4" style={{ color: COLORS.onSurfaceVariant }}>
                    {t.counterfactualDescription}
                  </p>
                  <ul
                    className="space-y-2 text-sm list-disc list-inside"
                    style={{ color: COLORS.onSurfaceVariant }}
                  >
                    <li>{t.exploreScenarios}</li>
                    <li>{t.understandBoundaries}</li>
                    <li>{t.identifyLeverage}</li>
                    <li>{t.testRiskFactors}</li>
                  </ul>
                </div>
              </div>

              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.howToUse}
                  </h3>
                </div>
                <div className="p-4 space-y-3 text-sm" style={{ color: COLORS.onSurfaceVariant }}>
                  <p>1. {t.step1}</p>
                  <p>2. {t.step2}</p>
                  <p>3. {t.step3}</p>
                  <p>4. {t.step4}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.extractedRules}
                  </h3>
                </div>
                <div className="p-4">
                  <StrategyRulesViewer rules={strategyRules} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.extractRules}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.labelStrategyName}
                    </label>
                    <input
                      type="text"
                      value={selectedStrategyName}
                      onChange={(e) => setSelectedStrategyName(e.target.value)}
                      placeholder={t.placeholderStrategyName}
                      className="w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors"
                      style={{
                        backgroundColor: COLORS.surface,
                        borderColor: COLORS.outline,
                        color: COLORS.onSurface,
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: COLORS.onSurfaceVariant }}>
                      {t.labelStrategyCode}
                    </label>
                    <textarea
                      value={strategyCode}
                      onChange={(e) => setStrategyCode(e.target.value)}
                      placeholder={t.placeholderStrategyCode}
                      rows={10}
                      className="w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y"
                      style={{
                        backgroundColor: COLORS.surface,
                        borderColor: COLORS.outline,
                        color: COLORS.onSurface,
                      }}
                    />
                  </div>

                  <Button
                    onClick={handleExtractRules}
                    disabled={!strategyCode.trim() || isLoading}
                    className="w-full"
                  >
                    {isLoading ? t.btnExtracting : t.btnExtract}
                  </Button>

                  <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    {t.extractionHint}
                  </p>
                </div>
              </div>

              <div
                className="rounded-2xl border"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderColor: COLORS.outline,
                }}
              >
                <div className="p-4 border-b" style={{ borderColor: COLORS.outline }}>
                  <h3 className="font-semibold" style={{ color: COLORS.onSurface }}>
                    {t.aboutRuleExtraction}
                  </h3>
                </div>
                <div className="p-4">
                  <p
                    className="text-sm mb-3"
                    style={{ color: COLORS.onSurfaceVariant }}
                  >
                    {t.ruleExtractionDescription}
                  </p>
                  <ul
                    className="space-y-2 text-sm list-disc list-inside"
                    style={{ color: COLORS.onSurfaceVariant }}
                  >
                    <li>{t.detectIndicators}</li>
                    <li>{t.extractConditions}</li>
                    <li>{t.generateDescriptions}</li>
                    <li>{t.showLineNumbers}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
