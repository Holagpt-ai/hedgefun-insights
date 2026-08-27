# Deno 2.3.0 is the first stable 2.x that reads lockfile version 5.
FROM denoland/deno:2.3.0
WORKDIR /repo
COPY services/scanner-stream-worker ./services/scanner-stream-worker
COPY supabase/functions/_shared/markets ./supabase/functions/_shared/markets
COPY supabase/functions/_shared/screeners/selection.ts ./supabase/functions/_shared/screeners/selection.ts
COPY supabase/functions/_shared/radar-v22 ./supabase/functions/_shared/radar-v22
WORKDIR /repo/services/scanner-stream-worker
RUN deno cache src/main.ts
EXPOSE 8080
CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
