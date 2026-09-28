import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outfile = path.join(here, "dist", "worker.mjs");
mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(here, "src", "main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  plugins: [
    {
      name: "stocksist-src-alias",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const base = path.join(repoRoot, "src", args.path.slice(2));
          const candidates = [
            base,
            `${base}.ts`,
            `${base}.tsx`,
            path.join(base, "index.ts"),
            path.join(base, "index.tsx"),
          ];
          const resolved = candidates.find((candidate) => existsSync(candidate));
          if (!resolved) return { errors: [{ text: `Cannot resolve ${args.path}` }] };
          return { path: resolved };
        });
      },
    },
  ],
});
