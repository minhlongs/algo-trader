// @ts-nocheck
/** @jsxImportSource react */
import { StitchCard, StitchCardHeader, StitchCardBody } from '../ui/stitch-card';

export interface StrategyRule {
  rule_id: string;
  type: 'technical_indicator' | 'sentiment' | 'extracted' | 'custom';
  indicator?: string;
  condition: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'UNKNOWN';
  description: string;
  line_number?: number;
}

interface StrategyRulesViewerProps {
  rules: StrategyRule[];
  strategyName: string;
  className?: string;
  onRuleClick?: (rule: StrategyRule) => void;
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Strategy Rules Viewer
 *
 * Displays extracted trading rules from strategy code.
 * Shows conditions, actions, and line numbers for easy reference.
 */
export function StrategyRulesViewer({
  rules,
  strategyName,
  className,
  onRuleClick
}: StrategyRulesViewerProps) {
  const getTypeIcon = (type: StrategyRule['type']): string => {
    switch (type) {
      case 'technical_indicator': return '📈';
      case 'sentiment': return '📰';
      case 'extracted': return '🤖';
      case 'custom': return '⚙️';
      default: return '📋';
    }
  };

  const getActionColor = (action: StrategyRule['action']): string => {
    switch (action) {
      case 'BUY': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'SELL': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'HOLD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getTypeColor = (type: StrategyRule['type']): string => {
    switch (type) {
      case 'technical_indicator': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'sentiment': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'extracted': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'custom': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  // Group rules by action
  const rulesByAction = rules.reduce((acc, rule) => {
    if (!acc[rule.action]) acc[rule.action] = [];
    acc[rule.action].push(rule);
    return acc;
  }, {} as Record<string, StrategyRule[]>);

  const actionOrder = ['BUY', 'SELL', 'HOLD', 'UNKNOWN'];

  return (
    <StitchCard className={className}>
      <StitchCardHeader>
        <h3 className="text-lg flex items-center gap-2 font-mono">
          <span className="text-cyan-400">📜</span>
          Strategy Rules: {strategyName}
        </h3>
        <p className="text-sm text-gray-400">
          Extracted {rules.length} rule{rules.length !== 1 ? 's' : ''} from strategy code
        </p>
      </StitchCardHeader>
      <StitchCardBody>
        {rules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg mb-2">No rules extracted</p>
            <p className="text-sm">
              This strategy may use complex logic or custom indicators that
              couldn't be automatically parsed.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {actionOrder.filter(action => rulesByAction[action]).map(action => (
              <div key={action}>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className={cn("px-2 py-1 text-xs", getActionColor(action as StrategyRule['action']))}>
                    {action}
                  </span>
                  <span className="text-gray-400">
                    ({rulesByAction[action].length} rule{rulesByAction[action].length !== 1 ? 's' : ''})
                  </span>
                </h4>
                <div className="space-y-2">
                  {rulesByAction[action].map((rule, idx) => (
                    <div
                      key={rule.rule_id}
                      className="p-3 rounded-lg border border-gray-800 bg-gray-900/50 hover:border-cyan-500/50 transition-all cursor-pointer"
                      onClick={() => onRuleClick?.(rule)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">{getTypeIcon(rule.type)}</span>
                          <span className={cn("px-2 py-1 text-xs border", getTypeColor(rule.type))}>
                            {rule.type.replace('_', ' ')}
                          </span>
                          {rule.indicator && (
                            <span className="px-2 py-1 text-xs border bg-gray-800 text-gray-300 border-gray-700">
                              {rule.indicator}
                            </span>
                          )}
                          {rule.line_number && (
                            <span className="text-xs text-gray-500">Line {rule.line_number}</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Condition</div>
                          <code className="block bg-gray-950 p-2 rounded text-sm text-cyan-300 font-mono border border-gray-800">
                            {rule.condition}
                          </code>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500 mb-1">Description</div>
                          <p className="text-sm text-gray-300">{rule.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </StitchCardBody>
    </StitchCard>
  );
}
