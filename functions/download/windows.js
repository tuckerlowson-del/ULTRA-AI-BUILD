import { latestRelease, downloadAsset } from "../_shared.js";

export async function onRequestGet({ env }) {
  try {
    const release = await latestRelease(env);
    const asset = release.assets.find(item => item.name.toLowerCase().endsWith(".exe"));
    if (!asset) return new Response("No Windows EXE is attached to the latest release.", { status: 404 });
    return await downloadAsset(asset, env, "ONE-BRAIN.exe");
  } catch (error) {
    return new Response(error.message || "Download unavailable.", { status: 503 });
  }
}
