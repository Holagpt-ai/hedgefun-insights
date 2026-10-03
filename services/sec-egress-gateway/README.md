# Stocksist SEC Egress Gateway

Isolated network path for Catalyst SEC filings. It is not a general proxy and it does not parse filings, attribute issuers, or own Catalyst backoff.

The existing Fly app `stocksist-ai-trader-shadow-worker` is a different process with different scaling and egress. This gateway is a separate app so its static egress IP belongs only to SEC traffic.

Production Catalyst stays on direct Supabase egress until `SEC_TRANSPORT_MODE=gateway` is set on `sync-catalyst-sec` after this service is deployed and its outbound IP is verified.

## Routes

| Route | Upstream | Enabled |
| --- | --- | --- |
| `GET /health` | none | yes |
| `GET /v1/sec/latest-filings` | SEC latest-filings Atom | yes |
| `GET /v1/sec/company-ticker-map` | SEC company ticker file | no |

Callers cannot pass an upstream URL. Disabled routes make no SEC request.

## Auth

`Authorization: Bearer <STOCKSIST_SEC_GATEWAY_SECRET>`

The comparison hashes both values and uses a fixed-length equality check. The secret is not accepted in the query string, not logged, and not returned. A later HMAC authenticator can replace `bearerAuthenticator` without changing routes.

Catalyst sends the same value as `SEC_GATEWAY_SECRET`.

## SEC identity

`SEC_USER_AGENT` is read only on the gateway. The gateway sends that value to SEC and ignores any User-Agent from Catalyst. Set an organization name and contact email. Do not commit the value.

## Transport guard

`/v1/sec/latest-filings` allows one in-flight upstream fetch. A second concurrent caller waits for that result.

`SEC_LATEST_FILINGS_MIN_INTERVAL_SECONDS` defaults to 240. A repeat call inside that window returns the last successful body with `x-stocksist-result-source: transport_cache` and does not call SEC. The cache lasts `SEC_LATEST_FILINGS_TRANSPORT_TTL_SECONDS` (240). A normal five-minute Catalyst wake is outside that window, so it fetches live.

A 429 is returned once, with `Retry-After` when SEC sends it. The gateway does not retry and does not replace the last successful body with the 429 body. Catalyst still applies `provider_rate_limited` and the 600-second filings quiet period.

## Deploy later

Do not run these commands from a coding session.

```bash
fly apps create stocksist-sec-egress-gateway
fly secrets set --app stocksist-sec-egress-gateway \
  STOCKSIST_SEC_GATEWAY_SECRET=... \
  SEC_USER_AGENT=...
fly deploy . --config services/sec-egress-gateway/fly.toml
fly ips allocate-egress --app stocksist-sec-egress-gateway -r iad
```

`fly ips allocate-egress` allocates an app-scoped IPv4 and IPv6 pair for region `iad`. That is outbound egress. `fly ips allocate-v4` allocates ingress and does not control the source address SEC sees.

Verify the outbound address from inside the machine before pointing Catalyst at the gateway:

```bash
fly ssh console --app stocksist-sec-egress-gateway -C "curl -fsS https://checkip.amazonaws.com"
fly ips list --app stocksist-sec-egress-gateway
```

Record the egress IPv4 in the deployment report. Optionally set `SEC_EGRESS_IDENTITY` to that value so authenticated diagnostics can show the marker. There is no public IP-echo route.

After the egress IP is confirmed, set Catalyst env `SEC_TRANSPORT_MODE=gateway`, `SEC_GATEWAY_BASE_URL`, and `SEC_GATEWAY_SECRET`, then redeploy `sync-catalyst-sec`. Leave company-map refresh on the direct path until a later explicit switch. Gateway failure does not fall back to direct SEC filings fetches.
