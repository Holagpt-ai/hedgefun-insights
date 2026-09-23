-- PostgREST schema cache refresh after scanner_intelligence_alerts tables/RPC go live.
NOTIFY pgrst, 'reload schema';