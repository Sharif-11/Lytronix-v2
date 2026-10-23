import { useEffect } from 'react';
import client from '../api/client';

const HEALTH_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function useHealthCheck() {
  useEffect(() => {
    // Initial check on mount
    client.get('/health', { skipErrorModal: true }).catch(() => {});

    // Set up interval for periodic checks
    const interval = setInterval(() => {
      client.get('/health', { skipErrorModal: true }).catch(() => {});
    }, HEALTH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);
}
