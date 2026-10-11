/// <reference types="npm:@supabase/functions-js/src/edge-runtime.d.ts" />
import { withSupabase } from 'npm:@supabase/server@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { makeModel, modelName } from '../_shared/providers/index.ts';
import { getWeeklyNote, type Store } from './getWeeklyNote.ts';

const answerColumns = 'created_at, retry_of, duration_ms, metrics, judgement';

function fail(message: string, error: unknown): never {
  console.error(message, error);
  throw new Error(message);
}

// Reads go through the caller's own login (Row Level Security: only their rows). The one write uses the server key.
function storeFor(db: SupabaseClient, admin: SupabaseClient, userId: string): Store {
  return {
    async profile() {
      const { data, error } = await db.from('profiles').select('timezone, baseline_answer_id').single();
      if (error) fail('weekly-note could not load the profile', error);
      return { timezone: data.timezone, baselineAnswerId: data.baseline_answer_id };
    },
    async answersSince(from) {
      const { data, error } = await db.from('answers').select(answerColumns).gte('created_at', from.toISOString()).order('created_at');
      if (error) fail('weekly-note could not load the answers', error);
      return data;
    },
    async answer(id) {
      const { data, error } = await db.from('answers').select(answerColumns).eq('id', id).maybeSingle();
      if (error) fail('weekly-note could not load the starting point', error);
      return data;
    },
    async notebook() {
      const { data, error } = await db.from('coach_notebooks').select('notes').maybeSingle();
      if (error) fail('weekly-note could not load the notebook', error);
      return data?.notes ?? '';
    },
    async savedNote(weekStart) {
      const { data, error } = await db.from('weekly_notes').select('text, days_covered').eq('week_start', weekStart).maybeSingle();
      if (error) fail('weekly-note could not load the saved note', error);
      return data;
    },
    async claim(weekStart) {
      const { data, error } = await admin.rpc('claim_weekly_note', { p_user_id: userId, p_week_start: weekStart });
      if (error) fail('weekly-note could not claim the week', error);
      return data === true;
    },
    async saveNote(note) {
      const { data, error } = await admin.rpc('save_weekly_note', {
        p_user_id: userId,
        p_week_start: note.weekStart,
        p_text: note.text,
        p_days_covered: note.daysCovered,
        p_prompt_version: note.promptVersion,
        p_model: note.model,
      });
      if (error) fail('weekly-note could not save the note', error);
      const saved = data?.[0];
      if (!saved) fail('weekly-note saved nothing', null);
      return saved;
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 });
    try {
      const store = storeFor(ctx.supabase, ctx.supabaseAdmin, userId);
      const reply = await getWeeklyNote({ store, model: makeModel(() => {}), modelName, now: new Date() });
      return Response.json(reply);
    } catch (error) {
      console.error('weekly-note failed', error);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  }),
};
