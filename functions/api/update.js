import { latestRelease } from "../_shared.js";

export async function onRequestGet({ env }) {
  try {
    const release = await latestRelease(env);
    return Response.json({
      tag_name: release.tag_name,
      name: release.name,
      published_at: release.published_at,
      html_url: release.html_url,
      assets: release.assets.map(asset => ({ name: asset.name, size: asset.size }))
    }, {
      headers: { "Cache-Control": "public, max-age=60" }
    });
  } catch (error) {
    return Response.json({ error: error.message || "Update service unavailable." }, { status: 503 });
  }
}
