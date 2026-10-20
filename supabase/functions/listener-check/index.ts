/// <reference types="npm:@supabase/functions-js/src/edge-runtime.d.ts" />
import { withSupabase } from 'npm:@supabase/server@1.9.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import manifest from './clips.json' with { type: 'json' };
import { handle, manifestSchema, parseRaters, type Store } from './listenerCheck.ts';

// Friends have no login: each has a secret link, checked against the LISTENER_RATERS secret. Everything here uses the
// server key, because the bucket and the table have no policies at all.
const clips = manifestSchema.parse(manifest).clips;
const raters = parseRaters(Deno.env.get('LISTENER_RATERS') ?? '');

// The page fetches the link before Play is tapped, and the browser keeps fetching parts of the file while a 2-minute
// clip plays, so the link has to outlast a pause before playing plus the clip. Still short enough that a copied link
// soon stops working.
const signedUrlSeconds = 900;

function storeFor(admin: SupabaseClient): Store {
  return {
    async ratedClips(rater) {
      const { data, error } = await admin.from('listener_ratings').select('clip').eq('rater', rater);
      if (error) throw new Error(`listener-check could not read ratings: ${error.message}`);
      return data.map((r) => r.clip);
    },
    async signedUrl(clip) {
      const { data, error } = await admin.storage.from('eval-clips').createSignedUrl(`${clip}.m4a`, signedUrlSeconds);
      if (error) throw new Error(`listener-check could not sign ${clip}: ${error.message}`);
      return data.signedUrl;
    },
    async saveRating(rating) {
      const { error } = await admin.from('listener_ratings').upsert({ ...rating, rated_at: new Date().toISOString() });
      if (error) throw new Error(`listener-check could not save a rating: ${error.message}`);
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    try {
      const reply = await handle(await req.json().catch(() => null), { raters, clips, store: storeFor(ctx.supabaseAdmin) });
      return Response.json(reply.body, { status: reply.status });
    } catch (error) {
      console.error('listener-check failed', error instanceof Error ? error.message : 'unknown');
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  }),
};
