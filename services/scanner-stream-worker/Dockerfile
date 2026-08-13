FROM denoland/deno:2.1.4
WORKDIR /repo
COPY services/scanner-stream-worker ./services/scanner-stream-worker
COPY supabase/functions/_shared/markets ./supabase/functions/_shared/markets
WORKDIR /repo/services/scanner-stream-worker
RUN deno cache src/main.ts
EXPOSE 8080
CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
