import { useState, useEffect } from "react";
import api from "./api";
import { Sistrum } from "./Symbols";

export default function AdminDashboard() {
  const [pw, setPw] = useState(localStorage.getItem("pt_admin") || "");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(null);
  const [trending, setTrending] = useState(null);
  const [users, setUsers] = useState(null);
  const [eventLog, setEventLog] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [venueDetail, setVenueDetail] = useState(null);
  const [venueAnalytics, setVenueAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [createError, setCreateError] = useState("");
  const [tab, setTab] = useState("overview");
  const [announcement, setAnnouncement] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState("");

  const h = { Authorization: `Bearer ${pw}` };
  const jh = { ...h, "Content-Type": "application/json" };

  async function login() {
    setLoading(true); setError("");
    try { const r = await api("/api/admin/stats", { headers: h }); if (r.ok) { localStorage.setItem("pt_admin", pw); setStats(await r.json()); setAuthed(true); } else setError("Wrong password"); }
    catch { setError("Server unreachable"); }
    setLoading(false);
  }

  async function refresh() {
    const [s, l, t, u, p] = await Promise.all([
      api("/api/admin/stats", { headers: h }).then(r => r.ok ? r.json() : null),
      api("/api/admin/live", { headers: h }).then(r => r.ok ? r.json() : null),
      api("/api/admin/trending", { headers: h }).then(r => r.ok ? r.json() : null),
      api("/api/admin/users", { headers: h }).then(r => r.ok ? r.json() : null),
      api("/api/admin/pipeline", { headers: h }).then(r => r.ok ? r.json() : null),
    ]);
    if (s) setStats(s); if (l) setLive(l); if (t) setTrending(t); if (u) setUsers(u); if (p) setPipeline(p);
  }

  async function loadEvents(type) {
    const q = type ? `?type=${type}&limit=100` : "?limit=100";
    const r = await api(`/api/admin/events${q}`, { headers: h });
    if (r.ok) setEventLog(await r.json());
  }

  async function createVenue() {
    if (!newName.trim() || !newSlug.trim()) { setCreateError("Name and slug required"); return; }
    const r = await api("/api/admin/venues", { method: "POST", headers: jh, body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim().toLowerCase() }) });
    const d = await r.json();
    if (!r.ok) { setCreateError(d.error); return; }
    alert(`Venue created!\n\nClaim code: ${d.claimCode}`);
    setNewName(""); setNewSlug(""); setShowCreate(false); refresh();
  }

  async function deleteVenue(id, name) { if (!confirm(`Delete "${name}"? Cannot be undone.`)) return; await api(`/api/admin/venues/${id}`, { method: "DELETE", headers: h }); refresh(); }
  async function togglePaid(id, paid) { await api(`/api/admin/venues/${id}/set-paid`, { method: "POST", headers: jh, body: JSON.stringify({ isPaid: !paid }) }); refresh(); }
  async function toggleSuspend(id, sus) { await api(`/api/admin/venues/${id}/suspend`, { method: "POST", headers: jh, body: JSON.stringify({ suspended: !sus }) }); refresh(); }
  async function regenCode(id) { const r = await api(`/api/admin/venues/${id}/regen-code`, { method: "POST", headers: h }); if (r.ok) { const d = await r.json(); alert(`New claim code: ${d.claimCode}`); refresh(); } }
  async function saveNote(id) { await api(`/api/admin/venues/${id}/note`, { method: "POST", headers: jh, body: JSON.stringify({ note: noteText }) }); setEditingNote(null); refresh(); }
  async function setTier(id) { const t = prompt("Tier (free, basic, pro, enterprise):"); if (!t) return; await api(`/api/admin/venues/${id}/set-tier`, { method: "POST", headers: jh, body: JSON.stringify({ tier: t }) }); refresh(); }
  async function editVenue(id) { const n = prompt("New name:"); if (!n) return; await api(`/api/admin/venues/${id}`, { method: "PUT", headers: jh, body: JSON.stringify({ name: n }) }); refresh(); }
  async function setAnn() { await api("/api/admin/announcement", { method: "POST", headers: jh, body: JSON.stringify({ message: announcement }) }); alert(announcement ? "Announcement set" : "Announcement cleared"); }
  async function exportVenues() { const r = await api("/api/admin/export-venues", { headers: h }); const csv = await r.text(); const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "partytime-venues.csv"; a.click(); }
  async function blockSong() { const id = prompt("Spotify ID to block:"); if (!id) return; await api("/api/admin/block-song", { method: "POST", headers: jh, body: JSON.stringify({ spotifyId: id, block: true }) }); alert("Song blocked"); }

  async function openVenueDetail(v) {
    setVenueDetail(v);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const r = await api(`/api/admin/venues/${v.id}/analytics?tz=${encodeURIComponent(tz)}`, { headers: h });
    if (r.ok) setVenueAnalytics(await r.json());
  }

  useEffect(() => { if (pw && !authed) login(); }, []);
  useEffect(() => { if (authed) { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); } }, [authed]);

  const bg = { backgroundColor: "#080808" };
  const scan = `repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(240,236,228,0.02) 3px,rgba(240,236,228,0.02) 4px)`;
  const grid = `repeating-linear-gradient(90deg,transparent,transparent 23px,rgba(240,236,228,0.03) 23px,rgba(240,236,228,0.03) 24px),repeating-linear-gradient(0deg,transparent,transparent 23px,rgba(240,236,228,0.03) 23px,rgba(240,236,228,0.03) 24px)`;

  if (!authed) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative" style={bg}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: grid }} />
      <Sistrum size={40} /><h1 className="text-xl font-bold text-white mt-4 mb-1 tracking-wider z-10">ADMIN</h1>
      <p className="text-white/30 text-xs italic mb-8 z-10">PartyTime command center</p>
      <div className="w-full max-w-xs z-10">
        <input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key==="Enter"&&login()} className="w-full bg-[#121210] border border-white/8 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none text-center font-mono mb-3" />
        <button onClick={login} disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-[#080808]" style={{backgroundColor:"#D4884A"}}>{loading?"...":"Enter"}</button>
        {error&&<p className="text-red-400 text-xs text-center mt-3 font-mono">{error}</p>}
      </div>
    </div>
  );

  if (venueDetail) {
    const va = venueAnalytics;
    const pm = va?Math.max(1,...va.peakHours.map(h=>h.count)):1;
    return (
      <div className="min-h-screen text-white p-6 md:p-10 relative" style={bg}>
        <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:scan}} />
        <div className="max-w-5xl mx-auto z-10 relative">
          <button onClick={()=>{setVenueDetail(null);setVenueAnalytics(null);}} className="text-white/30 hover:text-white text-sm font-mono mb-6">← Back</button>
          <h1 className="text-2xl font-bold font-mono mb-1">{venueDetail.name}</h1>
          <p className="text-[#D4884A] text-sm font-mono mb-8">/{venueDetail.slug}</p>
          {!va?<p className="text-white/30 font-mono text-sm">Loading...</p>:(
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                <Stat l="Songs" v={va.overview.songsPlayed}/><Stat l="Users" v={va.overview.uniqueUsers}/><Stat l="Votes" v={va.overview.totalVotes}/>
                <Stat l="Skipped" v={va.overview.totalSkips}/><Stat l="Added" v={va.overview.totalAdds}/><Stat l="Events" v={va.overview.totalEvents}/>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <Sec t="PEAK HOURS"><div className="flex items-end gap-1 h-24">{va.peakHours.map(h=><div key={h.hour} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-[#D4884A]/70 rounded-t" style={{height:`${(h.count/pm)*100}%`,minHeight:h.count>0?2:0}}/><span className="text-[7px] font-mono text-white/20">{h.hour}</span></div>)}</div></Sec>
                <Sec t="TOP SONGS">{va.topSongs.slice(0,10).map((s,i)=><div key={s.spotifyId} className="flex items-center justify-between py-1.5 border-b border-white/5 text-xs"><span className="text-white/20 font-mono w-6">{String(i+1).padStart(2,"0")}</span><div className="flex-1 min-w-0 mx-2"><p className="truncate">{s.title}</p><p className="text-white/30 truncate">{s.artist}</p></div><span className="text-[#D4884A] font-mono">{s.count}×</span></div>)}</Sec>
              </div>
              <Sec t="ACTIVITY"><div className="flex items-end gap-1 h-20">{va.activityDays.map(d=><div key={d.date} className="flex-1"><div className="w-full bg-[#D4884A]/50 rounded-t" style={{height:`${(d.count/Math.max(1,...va.activityDays.map(x=>x.count)))*100}%`,minHeight:d.count>0?2:0}}/></div>)}</div></Sec>
              <Sec t="RECENT EVENTS" c="mt-6"><div className="max-h-64 overflow-y-auto">{va.recentEvents.map((e,i)=><div key={i} className="flex gap-3 py-1.5 border-b border-white/5 text-xs font-mono"><span className="text-white/20 w-16">{new Date(e.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span><span className="text-[#D4884A] w-24">{e.type.replace("_"," ")}</span><span className="text-white/40">{e.user}</span>{e.title&&<span className="text-white/20 truncate">— {e.title}</span>}</div>)}</div></Sec>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!stats) return null;
  const mA = Math.max(1,...stats.activityDays.map(d=>d.count));

  const tabs = ["overview","venues","live","users","trending","events","pipeline","tools"];

  return (
    <div className="min-h-screen text-white p-6 md:p-10 relative" style={bg}>
      <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:grid}} />
      <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:scan}} />
      <div className="max-w-6xl mx-auto z-10 relative">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3"><Sistrum size={28}/><div><h1 className="text-xl font-bold font-mono tracking-wider">ADMIN</h1><p className="text-white/30 text-[10px] font-mono">PARTYTIME COMMAND CENTER</p></div></div>
          <div className="flex gap-3"><button onClick={refresh} className="text-[#D4884A] text-xs font-mono border border-[#D4884A] rounded-lg px-4 py-1.5 hover:bg-[#D4884A]/10">REFRESH</button><button onClick={()=>{setAuthed(false);localStorage.removeItem("pt_admin");}} className="text-white/30 text-xs font-mono hover:text-white">LOGOUT</button></div>
        </div>
        <div className="flex gap-1 mb-8 border-b border-white/8 pb-2 overflow-x-auto">{tabs.map(t=><button key={t} onClick={()=>{setTab(t);if(t==="events")loadEvents(eventFilter);}} className={`text-xs font-mono tracking-wider px-3 py-2 rounded-lg whitespace-nowrap transition ${tab===t?"text-white bg-white/5":"text-white/30 hover:text-white"}`}>{t.toUpperCase()}</button>)}</div>

        {tab==="overview"&&<>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <Stat l="Total Venues" v={stats.totalVenues}/><Stat l="Paid" v={stats.paidVenues} a/><Stat l="Active Now" v={live?.lobbyCount||0}/>
            <Stat l="Users Online" v={live?.totalUsers||0}/><Stat l="Connections" v={live?.totalConnections||0}/>
            <Stat l="All Users" v={stats.uniqueUsers}/><Stat l="Songs Played" v={stats.totalSongsPlayed}/><Stat l="Votes" v={stats.totalVotes}/>
            <Stat l="Events" v={stats.totalEvents}/><Stat l="B2C Limit" v="10/lobby"/>
          </div>
          <Sec t="PLATFORM ACTIVITY (30 DAYS)"><div className="flex items-end gap-1 h-24">{stats.activityDays.map(d=><div key={d.date} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-[#D4884A]/70 rounded-t" style={{height:`${(d.count/mA)*100}%`,minHeight:d.count>0?2:0}}/>{stats.activityDays.length<=15&&<span className="text-[7px] font-mono text-white/20">{d.date.slice(5)}</span>}</div>)}</div></Sec>
          {users&&<Sec t="USER GROWTH (30 DAYS)" c="mt-6"><div className="flex items-end gap-1 h-20">{users.growth.map(d=><div key={d.date} className="flex-1"><div className="w-full bg-[#1DB954]/50 rounded-t" style={{height:`${(d.count/Math.max(1,...users.growth.map(x=>x.count)))*100}%`,minHeight:d.count>0?2:0}}/></div>)}</div></Sec>}
        </>}

        {tab==="venues"&&<Sec t="VENUES">
          {showCreate?<div className="mb-6 p-4 border border-[#D4884A]/30 rounded-xl"><p className="text-[10px] font-mono text-white/30 tracking-wider mb-3">NEW VENUE</p><div className="grid md:grid-cols-2 gap-3 mb-3"><input placeholder="Venue name" value={newName} onChange={e=>{setNewName(e.target.value);setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-"));}} className="bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none"/><input placeholder="slug" value={newSlug} onChange={e=>setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} className="bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none"/></div>{createError&&<p className="text-red-400 text-xs font-mono mb-2">{createError}</p>}<div className="flex gap-3"><button onClick={createVenue} className="px-6 py-2 rounded-lg text-sm font-mono font-semibold text-[#080808]" style={{backgroundColor:"#D4884A"}}>Create</button><button onClick={()=>setShowCreate(false)} className="text-white/30 text-sm font-mono hover:text-white">Cancel</button></div></div>
          :<div className="flex gap-3 mb-4"><button onClick={()=>setShowCreate(true)} className="text-[#D4884A] text-xs font-mono border border-[#D4884A]/30 border-dashed rounded-lg px-4 py-2 hover:bg-[#D4884A]/10">+ Create Venue</button><button onClick={exportVenues} className="text-white/30 text-xs font-mono border border-white/10 rounded-lg px-4 py-2 hover:text-white">Export CSV</button></div>}
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/10">{["NAME","SLUG","OWNER","CODE","STATUS","TIER","EVENTS","PAID","NOTE","ACTIONS"].map(h=><th key={h} className="py-2 text-[10px] font-mono text-white/30 tracking-wider">{h}</th>)}</tr></thead><tbody>
            {stats.venues.map(v=><tr key={v.id} className={`border-b border-white/5 ${v.suspended?"opacity-40":""}`}>
              <td className="py-3"><button onClick={()=>openVenueDetail(v)} className="text-sm font-mono hover:text-[#D4884A] transition">{v.name}</button></td>
              <td className="py-3 text-xs font-mono text-[#D4884A]">/{v.slug}</td>
              <td className="py-3 text-xs font-mono">{v.ownerSpotifyId&&v.ownerSpotifyId!=="unclaimed"?<span className="text-[#1DB954]">✓</span>:<span className="text-white/20">—</span>}</td>
              <td className="py-3 text-xs font-mono">{v.claimCode&&<button onClick={()=>navigator.clipboard.writeText(v.claimCode)} className="text-[#D4884A] hover:opacity-70">{v.claimCode} 📋</button>}</td>
              <td className="py-3">{v.suspended?<span className="text-[10px] font-mono text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded">SUSPENDED</span>:v.isActive?<span className="text-[10px] font-mono bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30 px-2 py-0.5 rounded">LIVE</span>:<span className="text-[10px] font-mono bg-white/5 text-white/30 border border-white/10 px-2 py-0.5 rounded">OFF</span>}</td>
              <td className="py-3"><button onClick={()=>setTier(v.id)} className="text-[10px] font-mono text-white/40 hover:text-white">{v.tier||"free"}</button></td>
              <td className="py-3 text-xs font-mono text-white/50">{v.eventCount}</td>
              <td className="py-3"><button onClick={()=>togglePaid(v.id,v.isPaid)} className={`text-[10px] font-mono px-3 py-1 rounded ${v.isPaid?"bg-[#D4884A] text-[#080808]":"border border-white/10 text-white/30 hover:border-[#D4884A]"}`}>{v.isPaid?"PAID ✓":"FREE"}</button></td>
              <td className="py-3 text-xs font-mono">{editingNote===v.id?<div className="flex gap-1"><input value={noteText} onChange={e=>setNoteText(e.target.value)} className="bg-[#080808] border border-white/10 rounded px-2 py-1 text-xs text-white w-32 font-mono" onKeyDown={e=>e.key==="Enter"&&saveNote(v.id)}/><button onClick={()=>saveNote(v.id)} className="text-[#D4884A] text-[10px]">✓</button></div>:<button onClick={()=>{setEditingNote(v.id);setNoteText(v.adminNote||"");}} className="text-white/20 hover:text-white text-[10px] max-w-[120px] truncate">{v.adminNote||"add note"}</button>}</td>
              <td className="py-3"><div className="flex gap-2"><button onClick={()=>editVenue(v.id)} className="text-[10px] font-mono text-white/20 hover:text-white">edit</button><button onClick={()=>regenCode(v.id)} className="text-[10px] font-mono text-white/20 hover:text-[#D4884A]">regen</button><button onClick={()=>toggleSuspend(v.id,v.suspended)} className="text-[10px] font-mono text-white/20 hover:text-yellow-400">{v.suspended?"unsuspend":"suspend"}</button><button onClick={()=>deleteVenue(v.id,v.name)} className="text-[10px] font-mono text-white/20 hover:text-red-400">delete</button></div></td>
            </tr>)}
          </tbody></table>{stats.venues.length===0&&<p className="text-white/20 text-center py-8 text-xs font-mono italic">No venues</p>}</div>
        </Sec>}

        {tab==="live"&&live&&<>
          <div className="grid grid-cols-3 gap-3 mb-8"><Stat l="Active Lobbies" v={live.lobbyCount} a/><Stat l="Users Online" v={live.totalUsers}/><Stat l="Connections" v={live.totalConnections}/></div>
          <Sec t="ACTIVE LOBBIES">{live.activeLobbies.length===0?<p className="text-white/20 text-center py-8 text-xs font-mono italic">No active lobbies</p>:live.activeLobbies.map(l=><div key={l.code} className="flex items-center justify-between py-3 border-b border-white/5"><div><span className="text-sm font-mono">{l.code}</span><span className="text-xs font-mono text-white/30 ml-3">host: {l.host||"?"}</span></div><div className="flex items-center gap-2"><span className="text-xs font-mono text-white/40">{l.userCount} users</span><div className="flex gap-1">{l.users.map(u=><span key={u} className="text-[10px] font-mono bg-white/5 text-white/40 px-2 py-0.5 rounded">{u}</span>)}</div></div></div>)}</Sec>
        </>}

        {tab==="users"&&users&&<>
          <div className="grid grid-cols-2 gap-3 mb-8"><Stat l="Total Users" v={users.totalUsers} a/><Stat l="30-Day Active" v={users.growth.reduce((s,d)=>s+d.count,0)}/></div>
          <div className="grid md:grid-cols-2 gap-6">
            <Sec t="TOP USERS (BY SONGS ADDED)">{users.topByAdds.slice(0,15).map((u,i)=><div key={u.name} className="flex justify-between py-1.5 border-b border-white/5 text-xs font-mono"><span className="text-white/20 w-6">{i+1}</span><span className="flex-1 text-white">{u.name}</span><span className="text-[#D4884A]">{u.adds} adds</span><span className="text-white/30 ml-3">{u.votes} votes</span></div>)}</Sec>
            <Sec t="TOP USERS (BY VOTES)">{users.topByVotes.slice(0,15).map((u,i)=><div key={u.name} className="flex justify-between py-1.5 border-b border-white/5 text-xs font-mono"><span className="text-white/20 w-6">{i+1}</span><span className="flex-1 text-white">{u.name}</span><span className="text-[#D4884A]">{u.votes} votes</span><span className="text-white/30 ml-3">{u.adds} adds</span></div>)}</Sec>
          </div>
          <Sec t="USER GROWTH" c="mt-6"><div className="flex items-end gap-1 h-24">{users.growth.map(d=><div key={d.date} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-[#1DB954]/60 rounded-t" style={{height:`${(d.count/Math.max(1,...users.growth.map(x=>x.count)))*100}%`,minHeight:d.count>0?2:0}}/>{users.growth.length<=15&&<span className="text-[7px] font-mono text-white/20">{d.date.slice(5)}</span>}</div>)}</div></Sec>
        </>}

        {tab==="trending"&&trending&&<Sec t="TRENDING SONGS (7 DAYS)">{trending.trending.map((s,i)=><div key={s.spotifyId} className="flex items-center justify-between py-2 border-b border-white/5 text-xs"><div className="flex items-center gap-3 min-w-0"><span className="text-white/20 font-mono w-6">{String(i+1).padStart(2,"0")}</span><div className="min-w-0"><p className="text-sm truncate">{s.title}</p><p className="text-white/30 truncate italic">{s.artist}</p></div></div><span className="text-[#D4884A] font-mono ml-4">{s.count}×</span></div>)}</Sec>}

        {tab==="events"&&<>
          <div className="flex gap-2 mb-4">
            {["","user_joined","song_added","song_played","vote_cast","song_skipped","user_left"].map(t=><button key={t} onClick={()=>{setEventFilter(t);loadEvents(t);}} className={`text-[10px] font-mono px-3 py-1.5 rounded-lg transition ${eventFilter===t?"bg-white/10 text-white":"text-white/30 hover:text-white"}`}>{t||"ALL"}</button>)}
          </div>
          <Sec t="EVENT LOG">{eventLog?.events?.length?<div className="max-h-96 overflow-y-auto">{eventLog.events.map((e,i)=><div key={i} className="flex gap-3 py-1.5 border-b border-white/5 text-xs font-mono"><span className="text-white/20 w-28 shrink-0">{new Date(e.time).toLocaleString([],{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span><span className="text-[#D4884A] w-24 shrink-0">{e.type.replace(/_/g," ")}</span><span className="text-white/40 truncate">{e.payload?.userName||e.payload?.addedBy||""} {e.payload?.title?`— ${e.payload.title}`:""}</span></div>)}</div>:<p className="text-white/20 text-center py-8 text-xs font-mono italic">No events{eventFilter?` of type "${eventFilter}"`:""}</p>}</Sec>
        </>}

        {tab==="pipeline"&&pipeline&&<Sec t="VENUE PIPELINE">{pipeline.pipeline.map(v=><div key={v.id} className="flex items-center gap-4 py-3 border-b border-white/5"><span className={`text-[10px] font-mono px-2 py-0.5 rounded ${v.status==="active"?"bg-[#1DB954]/15 text-[#1DB954]":v.status==="created"?"bg-[#D4884A]/15 text-[#D4884A]":"bg-white/5 text-white/30"}`}>{v.status.toUpperCase()}</span><div className="flex-1 min-w-0"><p className="text-sm font-mono truncate">{v.name}</p><p className="text-xs text-white/30 font-mono">/{v.slug} · {v.tier}</p></div><span className="text-xs font-mono text-white/20 max-w-[200px] truncate">{v.note||""}</span><span className="text-[10px] font-mono text-white/15">{v.createdAt?.slice(0,10)}</span></div>)}</Sec>}

        {tab==="tools"&&<>
          <Sec t="ANNOUNCEMENT BANNER">
            <p className="text-xs text-white/30 font-mono mb-3">Set a message all users see at the top of the app. Leave empty to clear.</p>
            <div className="flex gap-3"><input value={announcement} onChange={e=>setAnnouncement(e.target.value)} placeholder="Your announcement..." className="flex-1 bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none"/><button onClick={setAnn} className="px-6 py-2 rounded-lg text-sm font-mono font-semibold text-[#080808]" style={{backgroundColor:"#D4884A"}}>Set</button></div>
          </Sec>
          <Sec t="CONTENT MODERATION" c="mt-6">
            <p className="text-xs text-white/30 font-mono mb-3">Block songs by Spotify ID. Blocked songs can't be added to any lobby.</p>
            <button onClick={blockSong} className="text-[#D4884A] text-xs font-mono border border-[#D4884A]/30 rounded-lg px-4 py-2 hover:bg-[#D4884A]/10">Block a Song</button>
          </Sec>
          <Sec t="SERVER HEALTH" c="mt-6">
            <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-[#1DB954]"/><span className="text-sm font-mono">API Online</span><span className="text-xs font-mono text-white/30 ml-4">Connections: {live?.totalConnections||0}</span></div>
          </Sec>
        </>}
      </div>
    </div>
  );
}

function Stat({l,v,a}){return<div className="bg-[#121210] border border-white/8 rounded-xl p-4"><p className="text-[9px] font-mono text-white/30 tracking-wider uppercase mb-1">{l}</p><p className={`text-lg font-bold font-mono ${a?"text-[#D4884A]":""}`}>{typeof v==="number"?v.toLocaleString():v}</p></div>}
function Sec({t,children,c=""}){return<section className={`mb-6 ${c}`}><h2 className="text-[10px] font-mono text-white/30 tracking-wider uppercase mb-3">{t}</h2><div className="bg-[#121210] border border-white/8 rounded-xl p-5">{children}</div></section>}
