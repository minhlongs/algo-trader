/**
 * Guide section: Platform overview — what CashClaw is and how it works.
 * Customer-facing: no internal infra details.
 */

export function GuideInfrastructure() {
  return (
    <section id="how-it-works">
      <h2 className="text-xl font-bold text-white mb-4">How CashClaw Works</h2>

      <div className="space-y-4 text-sm leading-relaxed">
        <p>CashClaw is a self-hosted algorithmic trading bot for Polymarket prediction markets.</p>
        <p>You run the bot on your own server. Your keys, your server, your profits.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-[${COLORS.surface}] border border-[${COLORS.surface}] rounded-lg p-3">
          <p className="text-[${COLORS.profit}] font-bold mb-2">You Own</p>
          <p>Private keys, VPS, all profits</p>
        </div>
        <div className="bg-[${COLORS.surface}] border border-[${COLORS.surface}] rounded-lg p-3">
          <p className="text-[${COLORS.primary}] font-bold mb-2">We Provide</p>
          <p>Bot software, dashboard, updates, AI models</p>
        </div>
        <div className="bg-[${COLORS.surface}] border border-[${COLORS.surface}] rounded-lg p-3">
          <p className="text-yellow-400 font-bold mb-2">You Need</p>
          <p>VPS ($10-20/mo) + Polymarket wallet + CashClaw tier</p>
        </div>
      </div>

      <div className="mt-6 bg-[${COLORS.surface}] border border-[${COLORS.surface}] rounded-lg p-4">
        <p className="text-[${COLORS.primary}] font-bold mb-2 text-sm">How Market Making Works</p>
        <div className="text-sm text-[${COLORS.onSurfaceVariant}] space-y-2">
          <p>Bot places BUY and SELL orders simultaneously on Polymarket.</p>
          <p>When someone takes your order, you earn the spread.</p>
          <p>Polymarket pays additional maker rebate daily.</p>
          <div className="mt-3 bg-[${COLORS.surface}] rounded p-3">
            <p>Market: <span className="text-white">&quot;Bitcoin hits $200K?&quot;</span></p>
            <p className="mt-1">
              BID YES @ <span className="text-[${COLORS.profit}]">0.42</span>{' '}
              &rarr; ASK YES @ <span className="text-[${COLORS.profit}]">0.52</span>{' '}
              &rarr; <span className="text-[${COLORS.primary}] font-bold">$0.10/share profit</span>
            </p>
          </div>
        </div>
      </div>

      {/* Expected Returns */}
      <div className="mt-6">
        <p className="text-sm text-white font-bold mb-3">Expected Returns</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[${COLORS.surface}]">
                <th className="text-left py-2 pr-6 text-[${COLORS.primary}]">Capital</th>
                <th className="text-left py-2 pr-6 text-[${COLORS.primary}]">Daily</th>
                <th className="text-left py-2 text-[${COLORS.primary}]">Monthly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[${COLORS.surface}]">
              <tr>
                <td className="py-2 pr-6 text-white">$1,000</td>
                <td className="py-2 pr-6">$5-25</td>
                <td className="py-2">$150-750</td>
              </tr>
              <tr>
                <td className="py-2 pr-6 text-white">$5,000</td>
                <td className="py-2 pr-6">$25-100</td>
                <td className="py-2">$750-3,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 rounded-r-lg">
          <p className="text-sm text-red-400 font-bold">WARNING</p>
          <p className="text-sm text-red-300 mt-1">
            Month 1 may LOSE $200-500 while learning. This is NOT a money printer.
          </p>
        </div>
      </div>
    </section>
  );
}
