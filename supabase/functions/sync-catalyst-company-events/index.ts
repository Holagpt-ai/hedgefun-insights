import { serveBot } from "../_shared/catalyst-intelligence/serve-bot.ts";

// Company events collector. Named apart from sync-catalyst-events, which
// remains the existing public catalyst_events ingestor.
serveBot("events");
