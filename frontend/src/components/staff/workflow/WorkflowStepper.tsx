import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock, ClipboardEdit, ListChecks, Camera, FileSignature, Wrench, ShieldCheck, Truck } from 'lucide-react';

const STEPS = [
  { num: 1, label: 'Job Order',  sub: 'Vehicle & Service Info',  icon: ClipboardEdit },
  { num: 2, label: 'Pre-Assessment', sub: 'Before Service Checklist', icon: ListChecks },
  { num: 3, label: 'Damage',     sub: 'Annotation & Photos',     icon: Camera },
  { num: 4, label: 'Waiver',     sub: 'Terms & Signature',       icon: FileSignature },
  { num: 5, label: 'Service',    sub: 'Service Proper',          icon: Wrench },
  { num: 6, label: 'QC',         sub: 'Quality Control',         icon: ShieldCheck },
  { num: 7, label: 'Release',    sub: 'Egress & Handoff',        icon: Truck },
];

interface WorkflowStepperProps {
  currentStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

export default function WorkflowStepper({ currentStep, completedSteps, onStepClick }: WorkflowStepperProps) {
  const progress = completedSteps.length / 7;

  return (
    <div className="workflow-stepper">
      {/* Header */}
      <div className="stepper-header">
        <span className="stepper-header-label">WORKFLOW</span>
        <span className="stepper-header-progress">{completedSteps.length}/7</span>
      </div>

      {/* Animated progress bar */}
      <div className="stepper-progress-track">
        <motion.div
          className="stepper-progress-fill"
          initial={{ height: 0 }}
          animate={{ height: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>

      {/* Steps */}
      <div className="stepper-steps">
        {STEPS.map((step, i) => {
          const isCompleted = completedSteps.includes(step.num);
          const isActive = currentStep === step.num;
          const isLocked = !isCompleted && !isActive && step.num > 1 && !completedSteps.includes(step.num - 1);
          const Icon = step.icon;

          return (
            <motion.div
              key={step.num}
              className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => !isLocked && onStepClick(step.num)}
              initial={false}
              animate={{
                opacity: isLocked ? 0.35 : 1,
                x: isActive ? 4 : 0,
                scale: isActive ? 1 : 1,
              }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              whileHover={!isLocked ? { x: 6 } : {}}
              whileTap={!isLocked ? { scale: 0.97 } : {}}
            >
              {/* Active glow backdrop */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    className="stepper-active-bg"
                    layoutId="stepper-active-bg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </AnimatePresence>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className={`stepper-connector ${isCompleted ? 'completed' : ''}`}>
                  <AnimatePresence>
                    {isCompleted && (
                      <motion.div
                        className="stepper-connector-fill"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Step circle */}
              <div className="stepper-circle-wrap">
                <motion.div
                  className="stepper-circle"
                  animate={{
                    borderColor: isCompleted ? '#22c55e' : isActive ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                    backgroundColor: isCompleted ? '#22c55e' : isActive ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.02)',
                    boxShadow: isActive
                      ? '0 0 20px rgba(245,158,11,0.25), 0 0 40px rgba(245,158,11,0.08)'
                      : isCompleted
                        ? '0 0 12px rgba(34,197,94,0.2)'
                        : '0 0 0px rgba(0,0,0,0)',
                  }}
                  transition={{ duration: 0.35 }}
                >
                  <AnimatePresence mode="wait">
                    {isCompleted ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      >
                        <Check style={{ width: 15, height: 15, color: '#fff', strokeWidth: 3 }} />
                      </motion.div>
                    ) : isLocked ? (
                      <motion.div
                        key="lock"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Lock style={{ width: 12, height: 12 }} />
                      </motion.div>
                    ) : (
                      <motion.span
                        key="num"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="stepper-num"
                      >
                        {step.num}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Active pulse ring */}
                {isActive && (
                  <motion.div
                    className="stepper-pulse"
                    animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>

              {/* Step info */}
              <div className="stepper-info">
                <motion.div
                  className="stepper-label"
                  animate={{
                    color: isActive ? '#ffffff' : isCompleted ? '#d4d4d8' : isLocked ? '#3f3f46' : '#a1a1aa',
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {step.label}
                </motion.div>
                <div className="stepper-sublabel">
                  {isCompleted ? '✓ Completed' : step.sub}
                </div>
              </div>

              {/* Active indicator bar */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    className="stepper-indicator"
                    layoutId="stepper-indicator"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
