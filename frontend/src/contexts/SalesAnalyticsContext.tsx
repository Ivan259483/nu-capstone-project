import React, { createContext, useContext } from 'react';
import { useSalesAnalytics } from '@/hooks/useSalesAnalytics';

type SalesAnalyticsType = ReturnType<typeof useSalesAnalytics>;

const SalesAnalyticsContext = createContext<SalesAnalyticsType | null>(null);

export function SalesAnalyticsProvider({ children }: { children: React.ReactNode }) {
  const analytics = useSalesAnalytics();
  return (
    <SalesAnalyticsContext.Provider value={analytics}>
      {children}
    </SalesAnalyticsContext.Provider>
  );
}

export function useSalesContext() {
  const context = useContext(SalesAnalyticsContext);
  if (!context) {
    throw new Error('useSalesContext must be used within SalesAnalyticsProvider');
  }
  return context;
}
