const OWNER = "tuckerlowson-del";
const REPO = "ULTRA-AI-BUILD";

async function latestRelease(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("The release token has not been configured.");
  }
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ONE-BRAIN-Website"
    }
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while checking releases.`);
  return response.json();
}

async function downloadAsset(asset, env, filename) {
  const response = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/octet-stream",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ONE-BRAIN-Website"
    }
  });
  if (!response.ok) return new Response("The release file could not be downloaded.", { status: 502 });
  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/update") {
        const release = await latestRelease(env);
        return Response.json({
          tag_name: release.tag_name,
          name: release.name,
          published_at: release.published_at,
          html_url: release.html_url,
          assets: release.assets.map(asset => ({ name: asset.name, size: asset.size }))
        }, { headers: { "Cache-Control": "public, max-age=60" } });
      }

      if (url.pathname === "/download/windows" || url.pathname === "/download/android") {
        const release = await latestRelease(env);
        const extension = url.pathname.endsWith("windows") ? ".exe" : ".apk";
        const filename = extension === ".exe" ? "ONE-BRAIN.exe" : "ONE-BRAIN-Android.apk";
        const asset = release.assets.find(item => item.name.toLowerCase().endsWith(extension));
        if (!asset) return new Response("The first ONE BRAIN release is not available yet.", { status: 404 });
        return await downloadAsset(asset, env, filename);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return new Response(error.message || "ONE BRAIN service temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};
