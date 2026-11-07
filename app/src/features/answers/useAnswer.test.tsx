import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import { useAnswer } from './useAnswer';

// The real Supabase client with its real realtime code, but a socket that never connects, so there's no network.
// This is deliberate: a hand-made fake only knows what we think Supabase does, which is how the retry crash got through.
jest.mock('@/lib/supabase', () => {
  const { createClient } = jest.requireActual('@supabase/supabase-js');
  class QuietSocket {
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    url: string;
    protocol = '';
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(url: string | URL) {
      this.url = String(url);
    }
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  return {
    supabase: createClient('http://localhost:54321', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { transport: QuietSocket, timeout: 100 },
    }),
  };
});

const row = {
  id: 'a1',
  user_id: 'u1',
  question_id: 7,
  retry_of: null,
  audio_path: 'u1/a1.m4a',
  duration_ms: 30_000,
  time_limit_ms: 120_000,
  status: 'uploaded',
  metrics: null,
  judgement: null,
  map: null,
  coaching: null,
  feedback_flagged: false,
  listener_confirmed: null,
};

const originalFetch = globalThis.fetch;
// The realtime client keeps join and retry timers running against a socket that never connects. Fake timers keep
// them from running in real time, and they are dropped after each test so Jest can exit.
beforeEach(() => {
  jest.useFakeTimers();
  globalThis.fetch = jest.fn(async () => new Response(JSON.stringify(row), { status: 200, headers: { 'Content-Type': 'application/json' } }));
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllTimers();
  jest.useRealTimers();
});
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('watching an answer', () => {
  // The feedback screen stays mounted under the before-and-after screen, so both watch the same answer.
  it('two screens can watch the same answer at once', async () => {
    const feedback = await renderHook(() => useAnswer('a1'), { wrapper: wrapper() });
    await expect(renderHook(() => useAnswer('a1'), { wrapper: wrapper() })).resolves.toBeDefined();
    await waitFor(() => expect(feedback.result.current.data?.id).toBe('a1'));
  });

  it('closing one screen leaves the other still watching', async () => {
    const feedback = await renderHook(() => useAnswer('a1'), { wrapper: wrapper() });
    const compare = await renderHook(() => useAnswer('a1'), { wrapper: wrapper() });
    expect(supabase.getChannels()).toHaveLength(2);

    await act(async () => {
      await compare.unmount();
    });
    expect(supabase.getChannels()).toHaveLength(1);

    await act(async () => {
      await feedback.unmount();
    });
    expect(supabase.getChannels()).toHaveLength(0);
  });

  it('with no answer id it watches nothing and loads nothing', async () => {
    const { result } = await renderHook(() => useAnswer(null), { wrapper: wrapper() });
    expect(supabase.getChannels()).toHaveLength(0);
    expect(result.current.fetchStatus).toBe('idle');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
