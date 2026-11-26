// Platform adapter: Electron keeps its native preload bridge; Android gets a safe chat-only bridge.
if (!window.onebrain) {
  const listeners = new Set();
  let activeController = null;
  let workspace = "Android device";
  const emit = (event) => listeners.forEach((listener) => {
    try { listener({ ...event, at: event.at || new Date().toISOString() }); } catch {}
  });

  window.onebrain = {
    isMobile: true,
    async getWorkspace() { return workspace; },
    async chooseWorkspace() {
      emit({ type: "status", message: "Folder selection is not available in the Android edition." });
      return workspace;
    },
    async getNetworkDevices() {
      return { devices: [], interfaceName: "Android network details unavailable", updatedAt: new Date().toISOString() };
    },
    onAgentEvent(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    stopAgent() {
      if (activeController) activeController.abort();
      emit({ type: "status", message: "Request stopped." });
    },
    async runAgent(task, apiKey, model) {
      if (!apiKey || !apiKey.trim()) throw new Error("Add your OpenRouter API key in Settings first.");
      activeController = new AbortController();
      emit({ type: "status", message: "Connecting to OpenRouter…" });
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: activeController.signal,
          headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/tuckerlowson-del/ULTRA-AI-BUILD",
            "X-Title": "ONE BRAIN Android"
          },
          body: JSON.stringify({
            model: model.trim() || "openai/gpt-4o-mini",
            messages: [
              { role: "system", content: "You are ONE BRAIN, a helpful AI assistant. You are running in the Android edition. You can answer questions and help plan tasks, but you cannot control the phone, a Windows PC, access local files, or perform background actions. Be clear about these limits." },
              { role: "user", content: task }
            ]
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || `OpenRouter request failed (HTTP ${response.status}).`);
        const answer = data?.choices?.[0]?.message?.content;
        const text = Array.isArray(answer) ? answer.map(part => part.text || "").join("\\n") : answer;
        if (!text) throw new Error("The selected model returned an empty response.");
        emit({ type: "final", message: String(text) });
        return text;
      } catch (error) {
        if (error.name === "AbortError") {
          emit({ type: "status", message: "Request stopped." });
          return;
        }
        emit({ type: "error", message: error.message || "AI request failed." });
        throw error;
      } finally {
        activeController = null;
      }
    }
  };
}
