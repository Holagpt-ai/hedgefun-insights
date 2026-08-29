export type BriefType = "am" | "pm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
};

export function relayJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/**
 * Map a generate-daily-brief HTTP response into the dispatcher contract.
 * HTTP 200 + { available: false } is an intentional generator outcome.
 * Non-2xx, malformed bodies, and missing success fields remain failures.
 */
export async function relayGenerator(genRes: Response, briefType: BriefType): Promise<Response> {
  let genBody: Record<string, unknown> | null = null;
  try {
    genBody = await genRes.json();
  } catch {
    return relayJson({ error: "invalid_generator_response" }, 502);
  }
  if (!genBody || typeof genBody !== "object") {
    return relayJson({ error: "invalid_generator_response" }, 502);
  }

  if (genRes.status === 401) {
    return relayJson({ error: "internal_authentication_failure" }, 500);
  }
  if (genRes.status === 400) {
    return relayJson({ error: "invalid_internal_schedule" }, 500);
  }
  if (genRes.status === 502) {
    return relayJson({ error: "generation_provider_failure" }, 502);
  }
  if (genRes.status === 503) {
    return relayJson({ error: "generation_source_unavailable" }, 503);
  }
  if (!genRes.ok) {
    return relayJson({ error: "invalid_generator_response" }, 502);
  }

  if (genBody.available === false) {
    const reason = typeof genBody.reason === "string" && genBody.reason.length > 0
      ? genBody.reason
      : "unavailable";
    const payload: Record<string, unknown> = {
      dispatched: false,
      reason,
      brief_type: briefType,
    };
    if (typeof genBody.brief_date === "string") payload.brief_date = genBody.brief_date;
    return relayJson(payload, 200);
  }

  const bd = genBody.brief_date;
  const bt = genBody.brief_type;
  if (bt !== briefType || typeof bd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
    return relayJson({ error: "invalid_generator_response" }, 502);
  }

  return relayJson(
    {
      dispatched: true,
      brief_type: briefType,
      brief_date: bd,
      cached: Boolean(genBody.cached),
    },
    200,
  );
}
