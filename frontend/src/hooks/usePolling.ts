import { useEffect, useState } from 'react';

interface PollOptions {
  interval?: number;
  maxAttempts?: number;
}

export const usePolling = <T>(
  fn: () => Promise<T>,
  onSuccess: (data: T) => void,
  options: PollOptions = {}
) => {
  const { interval = 2000, maxAttempts = 0 } = options;
  const [isPolling, setIsPolling] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!isPolling) return;

    const timer = setInterval(async () => {
      try {
        const data = await fn();
        onSuccess(data);
        setAttempts(prev => prev + 1);

        if (maxAttempts > 0 && attempts >= maxAttempts) {
          setIsPolling(false);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [isPolling, fn, onSuccess, interval, maxAttempts, attempts]);

  return {
    startPolling: () => { setIsPolling(true); setAttempts(0); },
    stopPolling: () => setIsPolling(false),
    isPolling,
    attempts
  };
};
