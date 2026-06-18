type CustomerDashboardOverviewCard = {
  key: string;
  label: string;
  value: string;
  helper: string;
  icon: string;
  iconClass: string;
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
    <div className="customer-overview-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.key}
          data-card={card.key}
          data-live={card.showPulse ? 'true' : undefined}
          className="customer-overview-card relative min-h-[112px] overflow-hidden rounded-2xl border bg-white p-4"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <span className="customer-overview-accent" aria-hidden="true" />
          <span className="customer-overview-glow" aria-hidden="true" />
          <div className="customer-overview-content relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="customer-overview-label text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{card.label}</span>
                <div className={`customer-overview-value mt-1.5 flex min-w-0 items-center gap-2 text-base font-black ${card.valueClass}`}>
                  {card.showPulse && (
                    <span className="customer-overview-live-dot" aria-hidden="true">
                      <span className="customer-overview-live-dot-core" />
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
              <div className="customer-overview-loyalty-track mt-2.5 rounded-full bg-blue-100/80 p-0.5">
                <div className="customer-overview-loyalty-shell h-1.5 overflow-hidden rounded-full bg-white/70">
                  <div className="customer-overview-loyalty-fill h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-blue-400" style={{ width: `${rewardTierProgressPct}%` }} />
                </div>
              </div>
            )}
            <p className="customer-overview-helper relative mt-auto pt-2 text-xs font-medium text-slate-400">{card.helper}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
