export function inspectGitDivergence(exec) {
  try {
    const head = exec("git rev-parse HEAD").trim();
    const main = exec("git rev-parse origin/main").trim();
    const ahead = Number(exec("git rev-list --count origin/main..HEAD").trim());
    const behind = Number(exec("git rev-list --count HEAD..origin/main").trim());
    const branch = exec("git rev-parse --abbrev-ref HEAD").trim();
    return { available: true, branch, head, main, ahead, behind };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function compareAssetManifests(local, remote) {
  if (!local?.js || !remote?.js) return { status: "incomplete" };
  const js = local.js === remote.js;
  const css = !local.css || !remote.css ? null : local.css === remote.css;
  return { status: js && css !== false ? "match" : "differ", js, css };
}

export function missingPackageScripts(packageJson) {
  const required = ["dev", "build", "typecheck", "test", "integrity"];
  return required.filter((name) => typeof packageJson.scripts?.[name] !== "string");
}
