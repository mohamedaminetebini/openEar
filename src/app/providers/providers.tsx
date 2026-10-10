import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { hydrateSettings, audioEngine } from '@/stores/app-store';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  useEffect(() => {
    void hydrateSettings();
    return () => {
      void audioEngine.dispose();
    };
  }, []);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
