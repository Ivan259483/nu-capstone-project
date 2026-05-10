import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type CalendarScheduleDnDContextValue = {
  isDraggingSchedule: boolean;
  setDraggingSchedule: (v: boolean) => void;
};

const CalendarScheduleDnDContext = createContext<CalendarScheduleDnDContextValue | null>(null);

export function CalendarScheduleDnDProvider({ children }: { children: React.ReactNode }) {
  const [isDraggingSchedule, setDraggingSchedule] = useState(false);

  const value = useMemo(
    () => ({
      isDraggingSchedule,
      setDraggingSchedule,
    }),
    [isDraggingSchedule],
  );

  return (
    <CalendarScheduleDnDContext.Provider value={value}>{children}</CalendarScheduleDnDContext.Provider>
  );
}

/** Used by SalesSmartCalendar + AdminHubPanel when nested under {@link CalendarScheduleDnDProvider}. */
export function useCalendarScheduleDnD(): CalendarScheduleDnDContextValue {
  const ctx = useContext(CalendarScheduleDnDContext);
  const noop = useCallback(() => {}, []);
  return ctx ?? { isDraggingSchedule: false, setDraggingSchedule: noop };
}
