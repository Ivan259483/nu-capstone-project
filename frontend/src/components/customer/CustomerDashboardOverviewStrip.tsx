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
    <div className="customer-overview-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          data-card={card.key}
          className="customer-overview-card relative min-h-[104px] overflow-hidden rounded-[18px] border bg-white p-3.5"
        >
          <div className="customer-overview-content relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <span className="customer-overview-label text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{card.label}</span>
                <div className="customer-overview-value mt-1.5 flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="truncate">{card.value}</span>
                </div>
              </div>
              <div className="customer-overview-icon ring-1 ring-inset">
                <iconify-icon icon={card.icon} width="19"></iconify-icon>
              </div>
            </div>
            {card.key === 'loyalty' && (
              <div className="customer-overview-loyalty-track mt-2.5 rounded-full bg-slate-100 p-0.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="customer-overview-loyalty-fill h-full rounded-full bg-slate-500" style={{ width: `${rewardTierProgressPct}%` }} />
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
