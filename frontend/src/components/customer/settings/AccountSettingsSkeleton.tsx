import './account-settings.css';

export function AccountSettingsSkeleton() {
  return <div className="account-loading-shell" role="status" aria-label="Loading account settings" aria-busy="true">
    <div className="account-loading-rail" aria-hidden="true"><span className="account-skeleton" />{Array.from({ length: 7 }, (_, i) => <span className="account-skeleton" key={i} />)}</div>
    <div className="account-loading-content" aria-hidden="true">
      <div className="account-loading-header"><span className="account-skeleton" /><span className="account-skeleton" /></div>
      <div className="account-settings"><div className="account-loading-title account-skeleton" />
        <div className="account-workspace">
          <div className="account-summary"><span className="account-skeleton account-loading-avatar" /><div className="account-loading-lines"><span className="account-skeleton" /><span className="account-skeleton" /><span className="account-skeleton" /></div></div>
          <div className="account-main">{[0, 1, 2].map((i) => <div className="account-section account-loading-section" key={i}><span className="account-skeleton" /><div className="account-loading-lines"><span className="account-skeleton" /><span className="account-skeleton" /><span className="account-skeleton" /></div></div>)}</div>
        </div>
      </div>
    </div>
  </div>;
}
