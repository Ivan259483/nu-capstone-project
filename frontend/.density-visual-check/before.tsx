import React from 'react';import {createRoot} from 'react-dom/client';import {Bell} from 'lucide-react';import {CustomerTopbar,CustomerProfileTrigger,CustomerMetricCard} from './before-ui';import './before.css';
 function Preview(){const activeBooking={bookingTime:'10:00 AM',bookingDate:'Preview date'};
 const formatTrackerClockLabel=(value)=>value; const postPayComplete=false,isFullyComplete=false,activeIdx=0,pct=0;
 const serviceTitle='Service preview',vehicleTitle='Vehicle preview',vehicleMeta='PLATE / Color',referenceLabel='Preview reference';
 const specialistLabel='Assigned team',updatedLabel='Just updated',formattedLoyaltyPoints='0',rewardTierProgressPct=0,rewardTier='Preview',rewardProgressLabel='Rewards preview';
 const atBookingConfirmedStage=true,trackerMotionStyle={'--tracker-progress':'0%','--tracker-progress-angle':'0deg'};
 const DASHBOARD_TRACKER_STEP_MEDIA_STAGE={},getCustomerStageSlotPhotos=()=>[],resolveTrackerStageDescription=()=>'';
 const normalizeTrackerDeepLinkStage=(value)=>value,highlightedTrackerStage='',trackerStageCardRefs={current:{}};
 const nav=()=>{},setTrackerEvidenceLightbox=()=>{},toCloudinaryEvidenceThumbUrl=(url)=>url;
const STEPS = [
                    { id: 'confirmed', label: 'Appointment Confirmed', short: 'Confirmed', sub: 'Booking secured', detail: 'Appointment locked and ready for shop intake.', icon: 'solar:calendar-bold', time: formatTrackerClockLabel(activeBooking?.bookingTime), mediaId: 'confirmed' },
                    { id: 'received', label: 'Vehicle Arrived', short: 'Arrived', sub: 'Shop intake complete', detail: 'Vehicle is checked in and prepared for the service bay.', icon: 'solar:garage-bold', time: '25%', mediaId: 'received' },
                    { id: 'in_progress', label: 'Service In Progress', short: 'In Service', sub: 'Technician working now', detail: 'Certified technicians are working on your vehicle now.', icon: 'solar:wrench-bold', time: '50%', mediaId: 'in_progress' },
                    { id: 'completed', label: 'Quality Check', short: 'QC Review', sub: 'Final inspection', detail: 'QC verifies finish quality before pickup readiness.', icon: 'solar:shield-check-bold', time: '75%', mediaId: 'completed' },
                    { id: 'paid', label: 'Ready for Pickup', short: 'Pickup', sub: 'Handover ready', detail: 'Final handover is ready for customer pickup.', icon: 'solar:car-bold', time: '100%', mediaId: 'paid' },
                  ] as const;const activeStep=STEPS[0],nextStep=STEPS[1],stageNote=activeStep.detail+' Next checkpoint: '+nextStep.label+'.';
 return <div className="customer-portal-theme"><CustomerTopbar greeting="Good night, Ivan" onBook={()=>{}} onOpenNavigation={()=>{}}><button className="customer-notification-trigger" aria-label="Notifications"><Bell size={20}/></button><CustomerProfileTrigger name="Ivan" open={false} onClick={()=>{}}/></CustomerTopbar><main style={{padding:20,background:'#f8fafc'}} className="customer-dashboard-home"><div className="customer-metrics customer-metrics--payments customer-overview-metrics" style={{marginBottom:16}}>{['Active booking','Your vehicle','Next appointment','Rewards balance'].map(label=><CustomerMetricCard label={label} value="Preview value" caption="Supporting text preview" icon={<Bell size={20}/>}/>)}</div><section className="customer-live-tracker-section">
                      <div
                        className={`customer-live-tracker${atBookingConfirmedStage ? ' customer-live-tracker--at-booking-confirmed' : ''}`}
                        style={trackerMotionStyle}
                      >
                        <div className="customer-live-tracker-header">
                          <div className="customer-live-title-block">
                            <div className="customer-live-eyebrow">
                              <span className="customer-live-dot" />
                              <span>Live Tracking</span>
	                            </div>
	                            <h2>{postPayComplete ? 'Service complete' : isFullyComplete ? 'Ready for pickup' : activeStep.label}</h2>
	                            <p>{serviceTitle} / {vehicleTitle}</p>
	                            <div className="customer-live-chip-row" aria-label="Live tracker details">
	                              <span>
	                                <iconify-icon icon="solar:bolt-circle-bold" width="13"></iconify-icon>
	                                {activeStep.short}
	                              </span>
	                              <span>
	                                <iconify-icon icon="solar:refresh-circle-bold" width="13"></iconify-icon>
	                                {updatedLabel}
	                              </span>
	                              <span>
	                                <iconify-icon icon="solar:hashtag-square-bold" width="13"></iconify-icon>
	                                {referenceLabel}
	                              </span>
	                            </div>
	                          </div>
	                          <div className="customer-live-header-actions">
	                            <button
	                              type="button"
	                              onClick={() => nav('tracker')}
	                              className="customer-live-open-button"
	                              aria-label="Open full live tracker"
	                              title="Open full live tracker"
	                            >
	                              <iconify-icon icon="solar:routing-2-bold" width="18"></iconify-icon>
	                              <span>Full Tracker</span>
	                            </button>
	                          </div>
	                        </div>

                        <div className="customer-live-command-grid">
                          <div className="customer-live-progress-panel">
	                            <div
	                              className="customer-live-progress-ring"
	                              aria-label={`Service ${pct}% complete`}
	                            >
                              <div>
                                <strong>{pct}%</strong>
	                                <span>complete</span>
	                              </div>
	                            </div>
	                            <div className="customer-live-progress-caption">
	                              <strong>{postPayComplete ? 'Service complete' : activeStep.label}</strong>
	                              <span>{postPayComplete ? 'Receipt issued' : nextStep ? `Next: ${nextStep.short}` : 'Pickup ready'}</span>
	                            </div>

	                            <div className="customer-live-summary-list">
                              <div>
                                <span>Vehicle</span>
                                <strong>{vehicleMeta}</strong>
                              </div>
                              <div>
                                <span>Team</span>
                                <strong>{specialistLabel}</strong>
                              </div>
                              <div>
                                <span>Reference</span>
                                <strong>{referenceLabel}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="customer-live-status-panel">
                            <div className="customer-live-status-topline">
                              <div>
                                <span>Current Stage</span>
                                <strong>{postPayComplete ? 'Service complete' : isFullyComplete ? 'Ready for Pickup' : activeStep.label}</strong>
                              </div>
                              <div>
                                <span>Step</span>
	                                <strong>{activeIdx + 1} / {STEPS.length}</strong>
	                              </div>
	                            </div>
	                            <p className="customer-live-stage-note">{stageNote}</p>

	                            <div className="customer-live-rail" aria-hidden="true">
                              <div className="customer-live-rail-fill" style={{ width: `${pct}%` }} />
                              <div className="customer-live-rail-markers">
                                {STEPS.map((step, i) => {
                                  const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
                                  const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
                                  return (
                                    <span
                                      key={step.id}
                                      className={`customer-live-rail-marker ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
                                      style={{ '--live-step-delay': `${i * 90}ms` } as React.CSSProperties}
                                    >
                                      <iconify-icon icon={isDone ? 'solar:check-circle-bold' : step.icon} width="13"></iconify-icon>
                                    </span>
                                  );
	                                })}
	                              </div>
	                            </div>
	                            <div className="customer-live-rail-labels" aria-hidden="true">
	                              {STEPS.map((step, i) => {
	                                const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
	                                const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
	                                return (
	                                  <span
	                                    key={step.id}
	                                    className={`${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
	                                    style={{ '--live-step-delay': `${i * 90}ms` } as React.CSSProperties}
	                                  >
	                                    {step.short}
	                                  </span>
	                                );
	                              })}
	                            </div>

	                            <div className="customer-live-reward-panel">
                              <div>
                                <span>Rewards Balance</span>
                                <strong>{formattedLoyaltyPoints} pts</strong>
                              </div>
                              <div className="customer-live-reward-progress">
                                <span style={{ width: `${rewardTierProgressPct}%` }} />
                              </div>
                              <p>{rewardTier} tier / {rewardProgressLabel}</p>
                            </div>
                          </div>
                        </div>

                        <div className="customer-live-step-grid">
                          {STEPS.map((step, i) => {
                            const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
                            const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
                            const mediaStageKey = DASHBOARD_TRACKER_STEP_MEDIA_STAGE[step.mediaId];
                            const shots = mediaStageKey ? getCustomerStageSlotPhotos(activeBooking as any, mediaStageKey) : [];
                            const thumbDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                            const caption = resolveTrackerStageDescription(activeBooking as any, mediaStageKey);
                            const statusLabel = isDone ? 'Complete' : isActive ? 'Live now' : 'Upcoming';
                            const hasPhotos = shots.length > 0;
                            const isQcEvidence = mediaStageKey === 'quality_check';
                            const stageKey = normalizeTrackerDeepLinkStage(mediaStageKey || step.id);
                            const isDeepLinkedStage = highlightedTrackerStage === stageKey;
                            /** Booking confirmation is informational only — no customer photo slot or "awaiting" state. */
                            const suppressEvidencePanel = step.id === 'confirmed' && !hasPhotos;
                            const evidenceGridClass = isQcEvidence
                              ? 'customer-live-evidence-grid mt-2 grid max-w-xs grid-cols-1 gap-2'
                              : 'customer-live-evidence-grid mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3';

                            return (
	                              <article
	                                key={step.id}
	                                ref={(node) => {
	                                  trackerStageCardRefs.current[stageKey] = node;
	                                }}
	                                data-tracker-stage={stageKey}
	                                className={`customer-live-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}${suppressEvidencePanel ? ' customer-live-step--confirmation' : ''} ${
	                                  isDeepLinkedStage
	                                    ? 'ring-2 ring-amber-300/80 shadow-[0_0_0_4px_rgba(245,158,11,0.16)]'
	                                    : ''
	                                }`}
	                                aria-current={isActive ? 'step' : undefined}
	                                style={{ '--live-step-delay': `${i * 95}ms` } as React.CSSProperties}
	                              >
	                                <div className="customer-live-step-main">
                                  <div className="customer-live-step-icon">
                                    <iconify-icon icon={isDone ? 'solar:check-read-bold' : step.icon} width="17"></iconify-icon>
                                  </div>
                                  <div className="customer-live-step-copy">
                                    <div>
                                      <h3>{step.label}</h3>
                                      <span>{statusLabel}</span>
                                    </div>
	                                    <p>{step.sub}</p>
	                                  </div>
	                                  <div className="customer-live-step-time">{step.time}</div>
	                                </div>

	                                {suppressEvidencePanel ? (
	                                  <div className="customer-live-confirm-summary" role="region" aria-label="Booking confirmation details">
	                                    <p className="customer-live-confirm-summary-lead">{caption || step.detail}</p>
	                                    <dl className="customer-live-confirm-summary-grid">
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Service</dt>
	                                        <dd>{serviceTitle}</dd>
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Vehicle</dt>
	                                        <dd>{vehicleTitle}</dd>
	                                        {vehicleMeta && vehicleMeta !== 'Vehicle profile syncing' ? (
	                                          <dd className="customer-live-confirm-summary-meta">{vehicleMeta}</dd>
	                                        ) : null}
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Schedule</dt>
	                                        <dd>
	                                          {[
	                                            activeBooking?.bookingDate || (activeBooking as any)?.date,
	                                            activeBooking?.bookingTime || (activeBooking as any)?.time,
	                                          ]
	                                            .map((x) => String(x || '').trim())
	                                            .filter(Boolean)
	                                            .join(' · ') || 'We will remind you before your slot'}
	                                        </dd>
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Reference</dt>
	                                        <dd className="customer-live-confirm-summary-ref">{referenceLabel}</dd>
	                                      </div>
	                                    </dl>
	                                    <p className="customer-live-confirm-summary-foot">
	                                      Bring your reference to reception for a quick check-in.
	                                    </p>
	                                  </div>
	                                ) : (hasPhotos || isDone || isActive) ? (
	                                  <div className="customer-live-step-evidence">
	                                    <div className="customer-live-evidence-meta">
	                                      <span>{isQcEvidence ? 'QC Form' : 'Customer Evidence'}</span>
	                                      <strong>
                                        {hasPhotos
                                          ? isQcEvidence
                                            ? '1 photo'
                                            : `${shots.length} photo${shots.length === 1 ? '' : 's'}`
                                          : isActive
                                            ? 'Upload pending'
                                            : 'Awaiting photo'}
                                      </strong>
	                                    </div>
	                                    <p>{caption || (hasPhotos ? 'Vehicle photos received.' : step.detail)}</p>
	                                    {hasPhotos ? (
                                      <div className={evidenceGridClass}>
                                        {shots.map((shot, shotIdx) => (
                                          <div key={shot.label} className="min-w-0">
                                            <p className="text-[10px] font-semibold text-slate-500 truncate mb-1">{shot.label}</p>
                                            <button
                                              type="button"
                                              className="customer-live-evidence-thumb cursor-zoom-in"
                                              aria-label={`${step.label} — ${shot.label} — enlarge`}
                                              onClick={() =>
                                                setTrackerEvidenceLightbox({
                                                  stepTitle: step.label,
                                                  items: shots.map((x) => ({ url: x.url, label: x.label })),
                                                  index: shotIdx,
                                                })
                                              }
                                            >
                                              <img src={toCloudinaryEvidenceThumbUrl(shot.url, thumbDpr)} alt="" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="customer-live-photo-placeholder">
                                        <iconify-icon icon="solar:camera-minimalistic-bold" width="18"></iconify-icon>
                                        <span>Awaiting photo</span>
                                      </div>
                                    )}
                                  </div>
	                                ) : null}
                              </article>
                            );
                          })}
                        </div>

                        <div className="customer-live-footer">
                          <span>
                            <iconify-icon icon="solar:shield-star-bold" width="14"></iconify-icon>
                            QC verified live tracker
                          </span>
                          <strong>{pct}% complete</strong>
                        </div>
                        {postPayComplete && (activeBooking as any)?.invoiceId && (
                          <div className="customer-live-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 12 }}>
                            <span>
                              <iconify-icon icon="solar:bill-list-bold" width="14"></iconify-icon>
                              Digital receipt
                            </span>
                            <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{String((activeBooking as any).invoiceId)}</strong>
                          </div>
                        )}
                      </div>
                    </section></main></div>;}
 createRoot(document.getElementById('root')!).render(<Preview/>);