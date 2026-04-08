import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { bookingService } from '@/services/api/bookingService';
import type { BookingRecord } from '@/services/api/types';

interface WorkflowContextValue {
  job: BookingRecord | null;
  loading: boolean;
  saving: boolean;
  activeStep: number;
  completedSteps: number[];
  setJob: (job: BookingRecord) => void;
  loadJob: (jobId: string) => Promise<void>;
  saveStep: (step: number, data: any, autoAdvance?: boolean) => Promise<void>;
  navigateToStep: (step: number) => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [job, setJob] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Derived state from the job
  const activeStep = job?.workflow?.currentStep || 1;
  const completedSteps = job?.workflow?.completedSteps || [];

  const loadJob = async (jobId: string) => {
    setLoading(true);
    try {
      const data = await bookingService.getBookingById(jobId);
      setJob(data);
      // Auto-resume to the correct route based on data.workflow.currentStep
      const targetStep = data.workflow?.currentStep || 1;
      pushRouteForStep(targetStep);
    } catch (err) {
      console.error('[WorkflowProvider] Failed to load job:', err);
    } finally {
      setLoading(false);
    }
  };

  const pushRouteForStep = (step: number) => {
    const routes: Record<number, string> = {
      1: '/(staff)/(screens)/workflow/Step1_BookingInbox',
      2: '/(staff)/(screens)/workflow/Step2_IngressChecklist',
      3: '/(staff)/(screens)/workflow/Step3_DigitalTerms',
      4: '/(staff)/(screens)/workflow/Step4_DamageAnnotation',
      5: '/(staff)/(screens)/workflow/Step5_JobOrder',
      6: '/(staff)/(screens)/workflow/Step6_LiveProgress',
      7: '/(staff)/(screens)/workflow/Step7_EgressChecklist',
      8: '/(staff)/(screens)/workflow/Step8_WarrantyReceipt',
      9: '/(staff)/(screens)/workflow/Step9_FinalRelease',
    };
    if (routes[step]) router.push(routes[step] as any);
  };

  const navigateToStep = (step: number) => {
    if (step > 1 && !completedSteps.includes(step - 1) && !completedSteps.includes(step)) {
      console.warn('[WorkflowProvider] Cannot skip to uncompleted step', step);
      return; 
    }
    pushRouteForStep(step);
  };

  const saveStep = async (step: number, stepData: any, autoAdvance = true) => {
    if (!job || !job.id) return;
    setSaving(true);
    
    try {
      const newCompleted = Array.from(new Set([...completedSteps, step]));
      const nextStep = autoAdvance ? Math.min(step + 1, 9) : activeStep;

      // Optimistic local update
      const optimisticJob: BookingRecord = {
        ...job,
        workflow: {
          ...job.workflow,
          currentStep: nextStep,
          completedSteps: newCompleted,
          status: 'in_progress',
        }
      };
      setJob(optimisticJob);

      // Async backend update
      const updatedJob = await bookingService.updateMobileWorkflow(job.id, {
        step,
        stepData,
        workflow: {
          currentStep: nextStep,
          completedSteps: newCompleted,
          status: 'in_progress'
        }
      });
      setJob(updatedJob);

      if (autoAdvance) {
        pushRouteForStep(nextStep);
      }
    } catch (err) {
      console.error('[WorkflowProvider] Failed to save step:', err);
      // Revert in real implementation if needed
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkflowContext.Provider value={{ job, loading, saving, activeStep, completedSteps, setJob, loadJob, saveStep, navigateToStep }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) throw new Error('useWorkflow must be used within WorkflowProvider');
  return context;
}
