import { latestRelease, downloadAsset } from "../_shared.js";

export async function onRequestGet({ env }) {
  try {
    const release = await latestRelease(env);
    const asset = release.assets.find(item => item.name.toLowerCase().endsWith(".apk"));
    if (!asset) return new Response("No Android APK is attached to the latest release.", { status: 404 });
    return await downloadAsset(asset, env, "ONE-BRAIN-Android.apk");
  } catch (error) {
    return new Response(error.message || "Download unavailable.", { status: 503 });
  }
}
