const OWNER = "tuckerlowson-del";
const REPO = "ULTRA-AI-BUILD";
const API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

async function latestRelease() {
  const response = await fetch(API, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ONE-BRAIN-Updater"
    },
    cf: { cacheTtl: 30, cacheEverything: true }
  });
  if (response.status === 404) throw new Error("No published ONE BRAIN release exists yet.");
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status}).`);
  return response.json();
}

function assetFor(release, extension) {
  return (release.assets || []).find(asset =>
    typeof asset.name === "string" &&
    asset.name.toLowerCase().endsWith(extension) &&
    typeof asset.browser_download_url === "string"
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/update") {
        const release = await latestRelease();
        const windows = assetFor(release, ".exe");
        const android = assetFor(release, ".apk");
        return Response.json({
          tag_name: release.tag_name,
          name: release.name,
          published_at: release.published_at,
          html_url: release.html_url,
          windows: windows ? {
            name: windows.name,
            size: windows.size,
            download_url: `${url.origin}/download/windows`
          } : null,
          android: android ? {
            name: android.name,
            size: android.size,
            download_url: `${url.origin}/download/android`
          } : null
        }, {
          headers: {
            "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      if (url.pathname === "/download/windows" || url.pathname === "/download/android") {
        const extension = url.pathname.endsWith("windows") ? ".exe" : ".apk";
        const asset = assetFor(await latestRelease(), extension);
        if (!asset) return new Response("No matching release asset has been published yet.", {
          status: 404,
          headers: { "Cache-Control": "no-store" }
        });
        const upstream = await fetch(asset.browser_download_url, {
          redirect: "follow",
          headers: { "User-Agent": "ONE-BRAIN-Downloads" }
        });
        if (!upstream.ok) return new Response(`Release download failed (${upstream.status}).`, {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        });
        const filename = extension === ".exe" ? "ONE-BRAIN.exe" : "ONE-BRAIN-Android.apk";
        const headers = new Headers(upstream.headers);
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);
        headers.set("Cache-Control", "private, no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(upstream.body, { status: 200, headers });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return new Response(error.message || "ONE BRAIN service temporarily unavailable.", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Retry-After": "30"
        }
      });
    }
  }
};
