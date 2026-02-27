import { useState, useEffect, useCallback } from 'react';
import { useMonitorWebSocket } from './useMonitorWebSocket';
import { showToast } from '../utils/toast';

export function useMonitorMode(
  onMonitorChange: ((active: boolean) => void) | undefined,
  satellite: string,
  sector: string,
  band: string,
  refetchRef: React.RefObject<(() => Promise<unknown>) | null>,
  onRefetch?: () => void,
) {
  const [monitoring, setMonitoring] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);

  const { lastEvent: wsLastEvent } = useMonitorWebSocket(monitoring, { satellite, sector, band });

  useEffect(() => {
    if (wsLastEvent && monitoring) {
      refetchRef.current?.();
      onRefetch?.();
    }
  }, [wsLastEvent, monitoring, refetchRef, onRefetch]);

  const toggleMonitor = useCallback(() => {
    setMonitoring((v) => {
      const next = !v;
      setAutoFetch(next);
      const toastLevel = next ? 'success' : 'info';
      const toastMsg = next ? 'Monitor mode activated' : 'Monitor mode stopped';
      showToast(toastLevel, toastMsg);
      onMonitorChange?.(next);
      return next;
    });
  }, [onMonitorChange]);

  const startMonitorRaw = useCallback((applyConfig: () => void) => {
    applyConfig();
    setAutoFetch(true);
    setMonitoring(true);
    onMonitorChange?.(true);
    showToast('success', 'Monitor mode activated');
  }, [onMonitorChange]);

  const stopMonitor = useCallback(() => {
    setMonitoring(false);
    setAutoFetch(false);
    onMonitorChange?.(false);
    showToast('info', 'Monitor mode stopped');
  }, [onMonitorChange]);

  return { monitoring, autoFetch, setAutoFetch, toggleMonitor, startMonitorRaw, stopMonitor };
}
