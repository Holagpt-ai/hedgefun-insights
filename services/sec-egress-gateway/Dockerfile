# Build context is the repository root:
#   fly deploy . --config services/sec-egress-gateway/fly.toml
FROM denoland/deno:2.4.3
WORKDIR /app
COPY services/sec-egress-gateway /app
EXPOSE 8080
USER deno
CMD ["deno", "run", "--allow-net", "--allow-env", "src/main.ts"]
