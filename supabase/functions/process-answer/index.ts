/// <reference types="npm:@supabase/functions-js/src/edge-runtime.d.ts" />
import { withSupabase } from 'npm:@supabase/server@1.9.0';
import { z } from 'npm:zod@4';

import { makeModel, modelName, transcriber, transcriberVersion } from '../_shared/providers/index.ts';
import { metricsSchema } from '../_shared/schemas/metrics.ts';
import { overDailyLimit } from './dailyLimit.ts';
import { dayStartIn } from '../_shared/dayStart.ts';
import { runPipeline } from './runPipeline.ts';

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
      .select('id, user_id, question_id, audio_path, duration_ms, time_limit_ms, status, transcript, metrics, map, judgement, coaching, created_at')
      .eq('id', body.data.answerId)
      .maybeSingle();
    if (error) {
      console.error('process-answer could not load the answer', error);
      return reply({ error: 'server_error' }, 500);
    }
    if (!answer) return reply({ error: 'not_found' }, 404);

    // Already done: nothing to run. Any earlier stage is picked up again from the last saved result.
    // An answer with no words stops after Measure, and that is also done.
    const measured = metricsSchema.safeParse(answer.metrics);
    if (answer.status === 'coached' || (measured.success && measured.data.wordCount === 0)) return reply({ status: answer.status }, 200);

    // Count the answers before this one on the same day, so tapping Try again on an answer that was allowed never counts
    // itself. The day is the person's own (their saved timezone), and UTC until they have one.
    const { data: profile, error: profileError } = await ctx.supabase.from('profiles').select('timezone').maybeSingle();
    // No timezone is not an error (UTC is used), so a failed read of it shouldn't stop the answer either. The 24-hour cap below still holds.
    if (profileError) console.error('process-answer could not load the profile, using UTC days', profileError);
    const dayStart = dayStartIn(profile?.timezone ?? null, new Date(answer.created_at));
    const lastDay = new Date(new Date(answer.created_at).getTime() - 24 * 60 * 60_000);
    const countBefore = (from: Date) =>
      ctx.supabase
        .from('answers')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', from.toISOString())
        .lt('created_at', answer.created_at);
    const [today, lastDayCount] = await Promise.all([countBefore(dayStart), countBefore(lastDay)]);
    if (today.error || lastDayCount.error) {
      console.error("process-answer could not count the person's answers", today.error ?? lastDayCount.error);
      return reply({ error: 'server_error' }, 500);
    }
    if (overDailyLimit(today.count ?? 0, lastDayCount.count ?? 0)) return reply({ error: 'daily_limit' }, 429);

    // A failed answer goes back to its last good stage, so the screen says "listening" again straight away.
    if (answer.status === 'failed') {
      const lastGood = answer.coaching
        ? 'coached'
        : answer.judgement
          ? 'judged'
          : answer.map
            ? 'mapped'
            : answer.metrics
              ? 'measured'
              : answer.transcript
                ? 'transcribed'
                : 'uploaded';
      const { error: resetError } = await ctx.supabaseAdmin.from('answers').update({ status: lastGood }).eq('id', answer.id);
      if (resetError) {
        console.error('process-answer could not reset the status', resetError);
        return reply({ error: 'server_error' }, 500);
      }
    }

    // Reply now and keep working: leaving the screen or locking the phone doesn't stop processing.
    EdgeRuntime.waitUntil(runPipeline(ctx.supabaseAdmin, answer, { transcriber, transcriberVersion, makeModel, modelName }));
    return reply({ status: 'started' }, 202);
  }),
};
