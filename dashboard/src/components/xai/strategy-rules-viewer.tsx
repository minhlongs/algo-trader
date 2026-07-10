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
  onRuleClick,
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
      case 'BUY': return 'text-profit border-outline bg-profit/10';
      case 'SELL': return 'text-loss border-outline bg-loss/10';
      case 'HOLD': return 'text-warning border-outline bg-warning/10';
      default: return 'text-muted border-outline bg-muted/10';
    }
  };

  const getTypeColor = (type: StrategyRule['type']): string => {
    switch (type) {
      case 'technical_indicator': return 'text-accent border-outline bg-accent/10';
      case 'sentiment': return 'text-accent border-outline bg-accent/10';
      case 'extracted': return 'text-accent border-outline bg-accent/10';
      case 'custom': return 'text-muted border-outline bg-muted/10';
      default: return 'text-muted border-outline bg-muted/10';
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
        <h3 className="text-lg flex items-center gap-2">
          <span className="text-accent">📜</span>
          Strategy Rules: {strategyName}
        </h3>
        <p className="text-sm text-muted-foreground">
          Extracted {rules.length} rule{rules.length !== 1 ? 's' : ''} from strategy code
        </p>
      </StitchCardHeader>
      <StitchCardBody>
        {rules.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <p className="text-lg mb-2">No rules extracted</p>
            <p className="text-sm text-muted-foreground">
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
                  <span className="text-muted-foreground">
                    ({rulesByAction[action].length} rule{rulesByAction[action].length !== 1 ? 's' : ''})
                  </span>
                </h4>
                <div className="space-y-2">
                  {rulesByAction[action].map((rule) => (
                    <div
                      key={rule.rule_id}
                      className="p-3 rounded-lg border border-outline bg-bg-surface/50 hover:border-accent/50 transition-all cursor-pointer"
                      onClick={() => onRuleClick?.(rule)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">{getTypeIcon(rule.type)}</span>
                          <span className={cn("px-2 py-1 text-xs border", getTypeColor(rule.type))}>
                            {rule.type.replace('_', ' ')}
                          </span>
                          {rule.indicator && (
                            <span className="px-2 py-1 text-xs border border-outline text-muted bg-bg-surface">
                              {rule.indicator}
                            </span>
                          )}
                          {rule.line_number && (
                            <span className="text-xs text-muted">Line {rule.line_number}</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-muted mb-1">Condition</div>
                          <code className="block bg-bg p-2 rounded text-sm text-accent border border-outline">
                            {rule.condition}
                          </code>
                        </div>

                        <div>
                          <div className="text-xs text-muted mb-1">Description</div>
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
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
