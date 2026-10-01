import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleReconciliationRequest } from "../_shared/catalyst-intelligence/reconcile-http.ts";
import { createSupabaseIntelStore } from "../_shared/catalyst-intelligence/supabase-store.ts";

serve((req) => {
  const env = (key: string) => Deno.env.get(key);
  return handleReconciliationRequest(req, {
    env,
    openStore: () => {
      const url = env("SUPABASE_URL") ?? "";
      const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!url || !key) throw new Error("missing_supabase");
      return Promise.resolve(createSupabaseIntelStore(createClient(url, key)));
    },
  });
});
