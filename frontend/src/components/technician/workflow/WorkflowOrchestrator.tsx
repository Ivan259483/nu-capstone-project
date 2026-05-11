import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Car, User, Hash } from 'lucide-react';
import WorkflowStepper from './WorkflowStepper';
import Step1_JobOrder from './Step1_JobOrder';
import Step2_IngressChecklist from './Step2_IngressChecklist';
import Step3_DamageAnnotation from './Step3_DamageAnnotation';
import Step4_Waiver from './Step4_Waiver';
import Step5_ServiceProper from './Step5_ServiceProper';
import Step6_QCChecklist from './Step6_QCChecklist';
import Step7_Egress from './Step7_Egress';
import { OrderService } from '@/lib/order-service';
import type { Booking } from '@/types';
import './workflow.css';

interface WorkflowOrchestratorProps {
  order: Booking;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: Booking) => void;
}

export default function WorkflowOrchestrator({ order, onClose, onOrderUpdated }: WorkflowOrchestratorProps) {
  const [currentOrder, setCurrentOrder] = useState<Booking>(order);
  const completedSteps = currentOrder.workflowCompletedSteps || [];

  // Determine the best starting step: last incomplete, or step 1
  const getInitialStep = () => {
    if (completedSteps.length === 0) return 1;
    for (let i = 1; i <= 7; i++) {
      if (!completedSteps.includes(i)) return i;
    }
    return 7; // All done, show last step
  };

  const [currentStep, setCurrentStep] = useState<number>(getInitialStep);
  const [error, setError] = useState<string | null>(null);

  const handleStepComplete = useCallback(async (step: number, data: any) => {
    setError(null);
    try {
      const orderId = currentOrder.id || (currentOrder as any)._id;
      const result = await OrderService.updateWorkflowStep(orderId, step, data);
      if (result.success && result.data) {
        const updated = { ...result.data, id: result.data._id || result.data.id };
        setCurrentOrder(updated);
        onOrderUpdated(updated);

        // Auto-advance to next step
        if (step < 7) {
          setCurrentStep(step + 1);
        }
      } else {
        setError(result.message || 'Failed to save step');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save step';
      setError(msg);
    }
  }, [currentOrder, onOrderUpdated]);

  const handleStepClick = (step: number) => {
    // Allow clicking completed steps or current step
    if (completedSteps.includes(step) || step === currentStep) {
      setCurrentStep(step);
      return;
    }
    // Allow clicking next step if previous is completed
    if (step > 1 && completedSteps.includes(step - 1)) {
      setCurrentStep(step);
      return;
    }
    // Step 1 is always accessible
    if (step === 1) {
      setCurrentStep(step);
    }
  };

  const isStepCompleted = (step: number) => completedSteps.includes(step);

  const renderStep = () => {
    const props = { order: currentOrder, isCompleted: isStepCompleted(currentStep) };
    switch (currentStep) {
      case 1: return <Step1_JobOrder {...props} onComplete={(data) => handleStepComplete(1, data)} />;
      case 2: return <Step2_IngressChecklist {...props} onComplete={(data) => handleStepComplete(2, data)} />;
      case 3: return <Step3_DamageAnnotation {...props} onComplete={(data) => handleStepComplete(3, data)} />;
      case 4: return <Step4_Waiver {...props} onComplete={(data) => handleStepComplete(4, data)} />;
      case 5: return <Step5_ServiceProper {...props} onComplete={(data) => handleStepComplete(5, data)} />;
      case 6: return <Step6_QCChecklist {...props} onComplete={(data) => handleStepComplete(6, data)} />;
      case 7: return <Step7_Egress {...props} onComplete={(data) => handleStepComplete(7, data)} />;
      default: return null;
    }
  };

  return (
    <motion.div
      className="workflow-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="workflow-header">
        <div className="workflow-header-left">
          <button className="workflow-back-btn" onClick={onClose}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back to Queue
          </button>
          <h2>JOB WORKFLOW</h2>
        </div>
        <div className="workflow-header-meta">
          <span><Hash style={{ width: 12, height: 12 }} />{currentOrder.orderNumber || currentOrder.id?.slice(-6)}</span>
          <span><User style={{ width: 12, height: 12 }} />{currentOrder.customerName}</span>
          <span><Car style={{ width: 12, height: 12 }} />{currentOrder.vehicleModel || currentOrder.vehicleInfo || '—'}</span>
          <span style={{
            padding: '2px 10px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            background: completedSteps.length === 7 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
            color: completedSteps.length === 7 ? '#22c55e' : '#f59e0b',
          }}>
            {completedSteps.length}/7 Steps
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="workflow-body">
        {/* Left: Stepper Sidebar */}
        <WorkflowStepper
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />

        {/* Right: Step Content */}
        <div className="workflow-content">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              ⚠️ {error}
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="workflow-nav">
        <div className="workflow-nav-inner">
          <button
            className="wf-btn secondary"
            onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
            disabled={currentStep === 1}
          >
            ← Previous
          </button>
          <span className="workflow-nav-step">
            STEP {currentStep} / 7
          </span>
          <button
            className="wf-btn secondary"
            onClick={() => {
              if (currentStep < 7 && (isStepCompleted(currentStep) || currentStep === 1)) {
                setCurrentStep(currentStep + 1);
              }
            }}
            disabled={currentStep === 7 || (!isStepCompleted(currentStep) && currentStep !== 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </motion.div>
  );
}
