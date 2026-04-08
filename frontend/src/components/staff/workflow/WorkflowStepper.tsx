import { motion } from 'framer-motion';
import { Check, Lock, ClipboardEdit, ListChecks, Camera, FileSignature, Wrench, ShieldCheck, Truck } from 'lucide-react';

const STEPS = [
  { num: 1, label: 'Job Order', sub: 'Vehicle & Service Info', icon: ClipboardEdit },
  { num: 2, label: 'Ingress', sub: 'Pre-Service Checklist', icon: ListChecks },
  { num: 3, label: 'Damage', sub: 'Annotation & Photos', icon: Camera },
  { num: 4, label: 'Waiver', sub: 'Terms & Signature', icon: FileSignature },
  { num: 5, label: 'Service', sub: 'Service Proper', icon: Wrench },
  { num: 6, label: 'QC', sub: 'Quality Control', icon: ShieldCheck },
  { num: 7, label: 'Release', sub: 'Egress & Handoff', icon: Truck },
];

interface WorkflowStepperProps {
  currentStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

export default function WorkflowStepper({ currentStep, completedSteps, onStepClick }: WorkflowStepperProps) {
  return (
    <div className="workflow-stepper">
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, padding: '0 14px 12px', marginBottom: 4 }}>
        Workflow Pipeline
      </div>
      {STEPS.map((step) => {
        const isCompleted = completedSteps.includes(step.num);
        const isActive = currentStep === step.num;
        // A step is locked if any previous step is not completed
        const isLocked = !isCompleted && !isActive && step.num > 1 && !completedSteps.includes(step.num - 1);
        const Icon = step.icon;

        const handleClick = () => {
          if (isLocked) return;
          onStepClick(step.num);
        };

        return (
          <motion.div
            key={step.num}
            className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
            onClick={handleClick}
            whileTap={!isLocked ? { scale: 0.97 } : {}}
          >
            <div className="stepper-circle">
              {isCompleted ? (
                <Check style={{ width: 14, height: 14 }} />
              ) : isLocked ? (
                <Lock style={{ width: 12, height: 12 }} />
              ) : (
                <span>{step.num}</span>
              )}
            </div>
            <div className="stepper-info">
              <div className="stepper-label">{step.label}</div>
              <div className="stepper-sublabel">{step.sub}</div>
            </div>
            {isActive && (
              <motion.div
                layoutId="stepper-active-indicator"
                style={{
                  position: 'absolute',
                  right: 12,
                  width: 4,
                  height: 20,
                  borderRadius: 2,
                  background: 'var(--accent)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
