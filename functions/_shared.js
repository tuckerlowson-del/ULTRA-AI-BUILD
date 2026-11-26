const OWNER = "tuckerlowson-del";
const REPO = "ULTRA-AI-BUILD";

export async function latestRelease(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("The website release token is not configured.");
  }
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ONE-BRAIN-Website"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed (${response.status}).`);
  }
  return response.json();
}

export async function downloadAsset(asset, env, filename) {
  const response = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/octet-stream",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ONE-BRAIN-Website"
    }
  });
  if (!response.ok) {
    return new Response("The release file could not be downloaded.", { status: 502 });
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: 200, headers });
}
