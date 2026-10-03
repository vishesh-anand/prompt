/// <reference types="npm:@supabase/functions-js/src/edge-runtime.d.ts" />
import { withSupabase } from 'npm:@supabase/server@1';
import { z } from 'npm:zod@4';

import { transcriber, transcriberVersion } from '../_shared/providers/index.ts';
import { runPipeline } from './runPipeline.ts';

// PRODUCT.md "Limits": at most 10 answers per person per day.
const dailyLimit = 10;

const bodySchema = z.object({ answerId: z.uuid() });

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return reply({ error: 'bad_request' }, 400);

    // ctx.supabase only sees the caller's own rows (Row Level Security), so a row someone else owns looks like it doesn't exist.
    const { data: answer, error } = await ctx.supabase
      .from('answers')
      .select('id, audio_path, status, transcript, metrics, created_at')
      .eq('id', body.data.answerId)
      .maybeSingle();
    if (error) {
      console.error('process-answer could not load the answer', error);
      return reply({ error: 'server_error' }, 500);
    }
    if (!answer) return reply({ error: 'not_found' }, 404);

    // Already done: nothing to run.
    if (['measured', 'judged', 'coached'].includes(answer.status)) return reply({ status: answer.status }, 200);

    // Count the answers before this one on the same (UTC) day, so tapping Try again on an answer that
    // was allowed never counts itself. Per-person timezones arrive with the profile in build step 7.
    const dayStart = new Date(answer.created_at);
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await ctx.supabase
      .from('answers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', answer.created_at);
    if (countError) {
      console.error('process-answer could not count today\'s answers', countError);
      return reply({ error: 'server_error' }, 500);
    }
    if ((count ?? 0) >= dailyLimit) return reply({ error: 'daily_limit' }, 429);

    // A failed answer goes back to its last good stage, so the screen says "listening" again straight away.
    if (answer.status === 'failed') {
      const { error: resetError } = await ctx.supabaseAdmin
        .from('answers')
        .update({ status: answer.transcript ? 'transcribed' : 'uploaded' })
        .eq('id', answer.id);
      if (resetError) {
        console.error('process-answer could not reset the status', resetError);
        return reply({ error: 'server_error' }, 500);
      }
    }

    // Reply now and keep working: leaving the screen or locking the phone doesn't stop processing.
    EdgeRuntime.waitUntil(runPipeline(ctx.supabaseAdmin, answer, transcriber, transcriberVersion));
    return reply({ status: 'started' }, 202);
  }),
};
