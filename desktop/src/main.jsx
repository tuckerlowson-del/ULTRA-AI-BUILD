import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bot, BrainCircuit, CheckCircle2, ChevronDown, CircleStop, Command, Cpu, FolderOpen, Globe, KeyRound, Monitor, Play, Plus, Send, Settings2, ShieldCheck, Sparkles, SquareTerminal, Wifi, XCircle } from "lucide-react";
import "./style.css";

function App() {
  const [apiKey,setApiKey]=useState(""); const [model,setModel]=useState("openai/gpt-4o-mini");
  const [task,setTask]=useState(""); const [events,setEvents]=useState([]); const [status,setStatus]=useState("Ready");
  const [running,setRunning]=useState(false); const [workspace,setWorkspace]=useState("Loading workspace…");
  const [preview,setPreview]=useState(""); const [page,setPage]=useState("agent");
  const [showSettings,setShowSettings]=useState(false);
  useEffect(()=>{ window.onebrain.getWorkspace().then(setWorkspace); return window.onebrain.onAgentEvent(e=>{
    setEvents(old=>[{...e,id:Date.now()+Math.random()},...old].slice(0,80));
    if(e.type==="status")setStatus(e.message);
    if(e.type==="screen"&&e.image)setPreview(e.image);
    if(e.type==="final")setStatus("Task completed — review the result.");
    if(e.type==="error")setStatus("Agent error");
  });},[]);
  const run=async()=>{if(!task.trim())return;setRunning(true);setStatus("Agent is working…");setEvents(old=>[{id:Date.now(),type:"user",message:task,at:new Date().toISOString()},...old]);try{await window.onebrain.runAgent(task,apiKey,model);}catch(e){setStatus(e.message);}finally{setRunning(false);}};
  const choose=async()=>setWorkspace(await window.onebrain.chooseWorkspace());
  const nav=[["agent","AI Operator",Bot],["activity","Activity",Activity],["settings","Settings",Settings2]];
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={23}/></div><div><b>ONE BRAIN</b><small>INTELLIGENCE SYSTEM</small></div></div>
      <div className="side-label">WORKSPACE</div>
      {nav.map(([id,label,Icon])=><button key={id} className={"nav "+(page===id?"active":"")} onClick={()=>setPage(id)}><Icon size={17}/>{label}</button>)}
      <div className="side-spacer"/>
      <div className="connection"><span className="pulse"/><div><b>LOCAL AGENT</b><small>Computer session ready</small></div></div>
      <div className="version">DESKTOP PREVIEW · 0.4.0</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">PRIVATE AI WORKSPACE</div><h1>{page==="agent"?"AI Operator":page==="activity"?"Execution activity":"Settings & connections"}</h1></div><div className="top-actions"><span className="secure"><ShieldCheck size={14}/> Permission-gated</span><button className="icon-btn" onClick={()=>setShowSettings(true)}><Settings2 size={18}/></button></div></header>
      {page==="agent"&&<div className="workspace-grid">
        <section className="center">
          <div className="welcome"><div className="welcome-icon"><Sparkles size={22}/></div><div><h2>What should I do on your PC?</h2><p>Describe the outcome. ONE BRAIN will plan, inspect, act with permission, and verify.</p></div></div>
          <div className="task-card">
            <div className="card-top"><span><Command size={14}/> TASK INSTRUCTIONS</span><span className="ready"><i/> {status}</span></div>
            <textarea value={task} onChange={e=>setTask(e.target.value)} placeholder="Example: Open my project folder, inspect the files, and tell me why the app is failing to start…" />
            <div className="task-bottom"><button className="workspace-pill" onClick={choose}><FolderOpen size={15}/><span>{workspace}</span><ChevronDown size={13}/></button><button className="run-btn" disabled={running||!task.trim()} onClick={run}>{running?<><Activity size={16}/> Working…</>:<><Play size={15} fill="currentColor"/> Run task</>}</button>{running&&<button className="stop-btn" onClick={()=>window.onebrain.stopAgent()}><CircleStop size={17}/> Stop</button>}</div>
          </div>
          <div className="section-heading"><div><h3>Live execution</h3><p>Agent actions and verification results</p></div><button className="text-btn" onClick={()=>setPage("activity")}>View all <ChevronDown size={14}/></button></div>
          <div className="timeline">{events.slice(0,5).map(e=><Event key={e.id} event={e}/>)}{events.length===0&&<div className="empty"><Activity size={22}/><b>No activity yet</b><span>Your agent's plan, tool calls and results will appear here.</span></div>}</div>
        </section>
        <aside className="right">
          <div className="panel preview-panel"><div className="panel-head"><span><Monitor size={15}/> DESKTOP PREVIEW</span><span className="live-dot">LIVE</span></div>{preview?<img className="preview-image" src={preview}/>:<div className="preview-empty"><Monitor size={34}/><b>Waiting for screen capture</b><span>The agent can inspect the desktop when needed.</span></div>}</div>
          <div className="panel"><div className="panel-head"><span><Cpu size={15}/> AGENT CONFIGURATION</span></div><label>MODEL ROUTE</label><input value={model} onChange={e=>setModel(e.target.value)} /><div className="model-note">OpenRouter model ID · choose a vision-capable model for screen understanding.</div><button className="outline-btn" onClick={()=>setShowSettings(true)}><KeyRound size={15}/> Configure API key</button></div>
          <div className="panel safety"><div className="safety-title"><ShieldCheck size={16}/> SAFETY CONTROLS</div><p>Clicks, typing, website launches and diagnostic commands require your approval. File access stays inside the selected workspace.</p><div className="safety-row"><CheckCircle2 size={14}/> No arbitrary shell commands</div><div className="safety-row"><CheckCircle2 size={14}/> No file deletion or password handling</div></div>
        </aside>
      </div>}
      {page==="activity"&&<section className="activity-page"><div className="section-heading"><div><h3>Agent activity log</h3><p>Newest events first · current session only</p></div></div>{events.map(e=><Event key={e.id} event={e}/>)}</section>}
      {page==="settings"&&<section className="settings-page"><div className="panel"><div className="panel-head"><span><KeyRound size={15}/> OPENROUTER CONNECTION</span></div><label>API KEY</label><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Paste your OpenRouter key — kept in memory only"/><p className="model-note">Your key is not written to disk by this preview. API usage may incur charges; configure a spending limit in your provider account.</p><label>MODEL ID</label><input value={model} onChange={e=>setModel(e.target.value)}/></div><div className="panel"><div className="panel-head"><span><FolderOpen size={15}/> WORKSPACE ACCESS</span></div><p className="model-note">The agent can list and read text files only within the folder you select.</p><button className="outline-btn" onClick={choose}>Choose workspace</button><p className="path">{workspace}</p></div></section>}
      <footer><span><span className="footer-led"/> SYSTEM READY</span><span>{status}</span><span>ONE BRAIN · PRIVATE BY DESIGN</span></footer>
    </main>
    {showSettings&&<div className="modal-backdrop" onClick={()=>setShowSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowSettings(false)}><XCircle size={18}/></button><h2>Connect your AI</h2><p>OpenRouter provides access to the model catalogue.</p><label>API KEY</label><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-…"/><label>MODEL ID</label><input value={model} onChange={e=>setModel(e.target.value)}/><button className="run-btn full" onClick={()=>setShowSettings(false)}>Save for this session</button><small>Key stays in app memory and is not persisted.</small></div></div>}
  </div>;
}
function Event({event:e}){const icon=e.type==="error"?<XCircle size={16}/>:e.type==="final"?<CheckCircle2 size={16}/>:e.type==="tool"?<SquareTerminal size={16}/>:e.type==="tool_result"?<CheckCircle2 size={16}/>:e.type==="user"?<Bot size={16}/>:<Activity size={16}/>;return <div className={"event "+(e.type||"")}><div className="event-icon">{icon}</div><div className="event-body"><b>{e.message}</b>{e.tool&&<small>{e.tool}</small>}{e.result&&typeof e.result==="string"&&<small>{e.result}</small>}</div><time>{e.at?new Date(e.at).toLocaleTimeString(): ""}</time></div>}
createRoot(document.getElementById("root")).render(<App/>);