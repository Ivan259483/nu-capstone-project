import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CustomerLiveTrackerHorizontalStep = {
  id: string;
  label: string;
  subtitle: string;
};

/** Short labels under each milestone — keep in sync with `DEFAULT_TRACKER_STAGE_DESCRIPTION`. */
export const CUSTOMER_LIVE_TRACKER_HORIZONTAL_STEPS: CustomerLiveTrackerHorizontalStep[] = [
  { id: 'confirmed', label: 'Appointment Confirmed', subtitle: 'Your visit is reserved' },
  { id: 'received', label: 'Vehicle Arrival', subtitle: 'Received at our bay' },
  { id: 'in_progress', label: 'Service in Progress', subtitle: 'Certified work underway' },
  { id: 'completed', label: 'Quality Check', subtitle: 'Every detail verified' },
  { id: 'paid', label: 'Ready for Pickup', subtitle: 'Yours to drive home' },
];

type Props = {
  steps?: CustomerLiveTrackerHorizontalStep[];
  /** 0-based index of the active milestone; earlier steps render as completed. */
  currentStep: number;
  className?: string;
};

export function CustomerLiveTrackerHorizontalStepper({
  steps = CUSTOMER_LIVE_TRACKER_HORIZONTAL_STEPS,
  currentStep,
  className,
}: Props) {
  // The stored tracker step is the latest completed checkpoint; the UI highlights the next milestone.
  const visualActiveStep = currentStep < 0 ? -1 : Math.min(currentStep + 1, steps.length - 1);
  const allComplete = currentStep >= steps.length;

  return (
    <div
      className={cn('customer-h-tracker-stepper w-full', className)}
      role="list"
      aria-label="Service progress"
    >
      <div className="customer-h-tracker-stepper__scroll">
        <div
          className="customer-h-tracker-stepper__row"
          style={{ '--step-count': steps.length } as CSSProperties}
        >
          {steps.map((step, index) => {
            const isDone = allComplete || index < visualActiveStep;
            const isActive = !allComplete && index === visualActiveStep;
            const isPending = !isDone && !isActive;

            return (
              <div key={step.id} className="customer-h-tracker-stepper__item" role="listitem">
                <div className="customer-h-tracker-stepper__step">
                  <div
                    className={cn(
                      'customer-h-tracker-stepper__circle',
                      isDone && 'customer-h-tracker-stepper__circle--done',
                      isActive && 'customer-h-tracker-stepper__circle--active',
                      isPending && 'customer-h-tracker-stepper__circle--pending',
                    )}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`${step.label}: ${isDone ? 'completed' : isActive ? 'current' : 'upcoming'}`}
                  >
                    {isDone ? (
                      <Check className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="customer-h-tracker-stepper__num">{index + 1}</span>
                    )}
                  </div>

                  <p
                    className={cn(
                      'customer-h-tracker-stepper__title',
                      (isDone || isActive) && 'customer-h-tracker-stepper__title--emphasis',
                      isPending && 'customer-h-tracker-stepper__title--muted',
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      'customer-h-tracker-stepper__subtitle',
                      isPending && 'customer-h-tracker-stepper__subtitle--muted',
                    )}
                  >
                    {step.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
