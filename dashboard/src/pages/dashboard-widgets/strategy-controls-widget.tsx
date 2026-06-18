/**
 * Strategy controls widget for dashboard.
 */
import { Card } from '../../components/ui/card';
import { StrategyStatusPanel } from '../../components/strategy-status-panel';
import { AdminControls } from '../../components/admin-controls';
import {
  AdminControlsSkeleton,
} from '../../components/skeleton-loaders';

interface StrategyControlsWidgetProps {
  colSpan: number;
  strategies: any[];
  botStatus: any;
  adminStatus: any;
  adminLoading: boolean;
  adminError: any;
  refreshAdmin: () => void;
  halt: (reason: string) => Promise<any>;
  resume: () => Promise<any>;
  onClickCapture?: () => void;
  trackEvent: (event: string, props?: any) => void;
}

export function StrategyControlsWidget({
  colSpan,
  strategies,
  botStatus,
  adminStatus,
  adminLoading,
  adminError,
  refreshAdmin,
  halt,
  resume,
  onClickCapture,
  trackEvent,
}: StrategyControlsWidgetProps) {
  const colSpanMap: Record<number, string> = {
    1: 'lg:col-span-1',
    2: 'lg:col-span-2',
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    8: 'lg:col-span-8',
    9: 'lg:col-span-9',
    10: 'lg:col-span-10',
    11: 'lg:col-span-11',
    12: 'lg:col-span-12',
  };

  const activeStrategies = strategies?.filter((s) => s.enabled).length ?? 0;

  return (
    <Card
      className={`${colSpanMap[colSpan] || 'lg:col-span-4'} flex flex-col justify-between h-[450px]`}
      onClickCapture={onClickCapture}
    >
      <div className="space-y-4 flex-grow overflow-y-auto scrollbar-thin pr-1 px-6 py-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-white text-sm font-semibold">Strategies & Controls</span>
          <span className="text-xs text-muted font-mono">{activeStrategies} active</span>
        </div>

        <StrategyStatusPanel strategies={strategies} botStatus={botStatus} />
      </div>

      <div className="border-t border-white/5 pt-4 mt-4 px-6 pb-4">
        <h4 className="text-xs text-muted uppercase font-bold tracking-wider mb-2">Emergency Switch</h4>
        {adminLoading ? (
          <AdminControlsSkeleton />
        ) : (
          <AdminControls
            status={adminStatus}
            halt={async (reason: string) => {
              const res = await halt(reason);
              trackEvent('emergency_switch_trigger', { action: 'halt', reason });
              return res;
            }}
            resume={async () => {
              const res = await resume();
              trackEvent('emergency_switch_trigger', { action: 'resume' });
              return res;
            }}
            loading={adminLoading}
            error={adminError}
            onRefresh={refreshAdmin}
          />
        )}
      </div>
    </Card>
  );
}
