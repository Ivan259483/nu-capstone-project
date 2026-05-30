type CustomerDashboardOverviewCard = {
  key: string;
  label: string;
  value: string;
  helper: string;
  icon: string;
  borderClass: string;
  iconClass: string;
  glowClass: string;
  valueClass: string;
  showPulse: boolean;
};

type CustomerDashboardOverviewStripProps = {
  cards: readonly CustomerDashboardOverviewCard[];
  rewardTierProgressPct: number;
};

export function CustomerDashboardOverviewStrip({
  cards,
  rewardTierProgressPct,
}: CustomerDashboardOverviewStripProps) {
  return (
    <div className="customer-overview-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`customer-overview-card relative min-h-[132px] overflow-hidden rounded-2xl border border-l-4 bg-white p-4 ${card.borderClass}`}
        >
          <div className={`pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r ${card.glowClass} to-transparent`} />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{card.label}</span>
                <div className={`mt-2 flex min-w-0 items-center gap-2 text-base font-black ${card.valueClass}`}>
                  {card.showPulse && (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60"></span>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600"></span>
                    </span>
                  )}
                  <span className="truncate">{card.value}</span>
                </div>
              </div>
              <div className={`customer-overview-icon ring-1 ring-inset ${card.iconClass}`}>
                <iconify-icon icon={card.icon} width="19"></iconify-icon>
              </div>
            </div>
            {card.key === 'loyalty' && (
              <div className="mt-3 rounded-full bg-amber-100/80 p-0.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" style={{ width: `${rewardTierProgressPct}%` }} />
                </div>
              </div>
            )}
            <p className="relative mt-auto pt-3 text-xs font-medium text-slate-400">{card.helper}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
