import { useState, useEffect } from "react";
import api from "./api";
import { Sistrum } from "./Symbols";

export default function AdminDashboard() {
  const [password, setPassword] = useState(localStorage.getItem("pt_admin") || "");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(null);
  const [trending, setTrending] = useState(null);
  const [venueDetail, setVenueDetail] = useState(null);
  const [venueAnalytics, setVenueAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [createError, setCreateError] = useState("");
  const [tab, setTab] = useState("overview");

  const headers = { Authorization: `Bearer ${password}` };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  async function login() {
    setLoading(true); setError("");
    try {
      const res = await api("/api/admin/stats", { headers });
      if (res.ok) { localStorage.setItem("pt_admin", password); setStats(await res.json()); setAuthed(true); }
      else setError("Wrong password");
    } catch { setError("Server unreachable"); }
    setLoading(false);
  }

  async function refresh() {
    const [s, l, t] = await Promise.all([
      api("/api/admin/stats", { headers }).then((r) => r.ok ? r.json() : null),
      api("/api/admin/live", { headers }).then((r) => r.ok ? r.json() : null),
      api("/api/admin/trending", { headers }).then((r) => r.ok ? r.json() : null),
    ]);
    if (s) setStats(s);
    if (l) setLive(l);
    if (t) setTrending(t);
  }

  async function createVenue() {
    if (!newName.trim() || !newSlug.trim()) { setCreateError("Name and slug required"); return; }
    setCreateError("");
    const res = await api("/api/admin/venues", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim().toLowerCase() }) });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error); return; }
    alert(`Venue created!\n\nClaim code: ${data.claimCode}\n\nSend this to the venue owner.`);
    setNewName(""); setNewSlug(""); setShowCreate(false); refresh();
  }

  async function deleteVenue(id, name) {
    if (!confirm(`Delete "${name}"? This removes all data and cannot be undone.`)) return;
    await api(`/api/admin/venues/${id}`, { method: "DELETE", headers });
    refresh();
  }

  async function togglePaid(id, paid) {
    await api(`/api/admin/venues/${id}/set-paid`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ isPaid: !paid }) });
    refresh();
  }

  async function toggleSuspend(id, suspended) {
    await api(`/api/admin/venues/${id}/suspend`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ suspended: !suspended }) });
    refresh();
  }

  async function openVenueDetail(venue) {
    setVenueDetail(venue);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await api(`/api/admin/venues/${venue.id}/analytics?tz=${encodeURIComponent(tz)}`, { headers });
    if (res.ok) setVenueAnalytics(await res.json());
  }

  useEffect(() => { if (password && !authed) login(); }, []);
  useEffect(() => { if (authed) { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); } }, [authed]);

  const bg = { backgroundColor: "#080808" };
  const scanBg = `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(240,236,228,0.02) 3px, rgba(240,236,228,0.02) 4px)`;
  const gridBg = `repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px), repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px)`;

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative" style={bg}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
        <Sistrum size={40} />
        <h1 className="text-xl font-bold text-white mt-4 mb-1 tracking-wider relative z-10">ADMIN</h1>
        <p className="text-white/30 text-xs italic mb-8 relative z-10">PartyTime command center</p>
        <div className="w-full max-w-xs relative z-10">
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full bg-[#121210] border border-white/8 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none text-center font-mono mb-3" />
          <button onClick={login} disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-[#080808] hover:opacity-90" style={{ backgroundColor: "#D4884A" }}>{loading ? "..." : "Enter"}</button>
          {error && <p className="text-red-400 text-xs text-center mt-3 font-mono">{error}</p>}
        </div>
      </div>
    );
  }

  // Venue detail view
  if (venueDetail) {
    const va = venueAnalytics;
    const peakMax = va ? Math.max(1, ...va.peakHours.map((h) => h.count)) : 1;
    return (
      <div className="min-h-screen text-white p-6 md:p-10 relative" style={bg}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanBg }} />
        <div className="max-w-5xl mx-auto relative z-10">
          <button onClick={() => { setVenueDetail(null); setVenueAnalytics(null); }} className="text-white/30 hover:text-white text-sm font-mono mb-6">← Back to dashboard</button>
          <h1 className="text-2xl font-bold font-mono mb-1">{venueDetail.name}</h1>
          <p className="text-[#D4884A] text-sm font-mono mb-8">/{venueDetail.slug}</p>

          {!va ? <p className="text-white/30 font-mono text-sm">Loading analytics...</p> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                <Stat label="Songs Played" value={va.overview.songsPlayed} />
                <Stat label="Unique Users" value={va.overview.uniqueUsers} />
                <Stat label="Votes" value={va.overview.totalVotes} />
                <Stat label="Skipped" value={va.overview.totalSkips} />
                <Stat label="Added" value={va.overview.totalAdds} />
                <Stat label="Total Events" value={va.overview.totalEvents} />
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <Section title="PEAK HOURS">
                  <div className="flex items-end gap-1 h-24">
                    {va.peakHours.map((h) => (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-[#D4884A]/70 rounded-t" style={{ height: `${(h.count / peakMax) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }} />
                        <span className="text-[7px] font-mono text-white/20">{h.hour}</span>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="TOP SONGS">
                  {va.topSongs.slice(0, 10).map((s, i) => (
                    <div key={s.spotifyId} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 text-xs">
                      <span className="text-white/20 font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                      <div className="flex-1 min-w-0 mx-2">
                        <p className="truncate">{s.title}</p>
                        <p className="text-white/30 truncate">{s.artist}</p>
                      </div>
                      <span className="text-[#D4884A] font-mono">{s.count}×</span>
                    </div>
                  ))}
                </Section>
              </div>

              <Section title="ACTIVITY">
                <div className="flex items-end gap-1 h-20">
                  {va.activityDays.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-[#D4884A]/50 rounded-t" style={{ height: `${(d.count / Math.max(1, ...va.activityDays.map((x) => x.count))) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }} />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="RECENT EVENTS" className="mt-6">
                <div className="max-h-64 overflow-y-auto">
                  {va.recentEvents.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/5 text-xs font-mono">
                      <span className="text-white/20 w-20">{new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-[#D4884A] w-24">{e.type.replace("_", " ")}</span>
                      <span className="text-white/40">{e.user}</span>
                      {e.title && <span className="text-white/20 truncate">— {e.title}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!stats) return null;
  const maxAct = Math.max(1, ...stats.activityDays.map((d) => d.count));

  return (
    <div className="min-h-screen text-white p-6 md:p-10 relative" style={bg}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanBg }} />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Sistrum size={28} />
            <div>
              <h1 className="text-xl font-bold font-mono tracking-wider">ADMIN</h1>
              <p className="text-white/30 text-[10px] font-mono">PARTYTIME COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={refresh} className="text-[#D4884A] text-xs font-mono border border-[#D4884A] rounded-lg px-4 py-1.5 hover:bg-[#D4884A]/10 transition">REFRESH</button>
            <button onClick={() => { setAuthed(false); localStorage.removeItem("pt_admin"); }} className="text-white/30 text-xs font-mono hover:text-white">LOGOUT</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-white/8 pb-2">
          {["overview", "venues", "live", "trending"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-mono tracking-wider px-4 py-2 rounded-lg transition ${tab === t ? "text-white bg-white/5" : "text-white/30 hover:text-white"}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
              <Stat label="Total Venues" value={stats.totalVenues} />
              <Stat label="Paid Venues" value={stats.paidVenues} accent />
              <Stat label="Active Now" value={live?.lobbyCount || 0} />
              <Stat label="Users Online" value={live?.totalUsers || 0} />
              <Stat label="Connections" value={live?.totalConnections || 0} />
              <Stat label="Unique Users" value={stats.uniqueUsers} />
              <Stat label="Songs Played" value={stats.totalSongsPlayed} />
              <Stat label="Votes Cast" value={stats.totalVotes} />
              <Stat label="Total Events" value={stats.totalEvents} />
              <Stat label="B2C Limit" value="10/lobby" />
            </div>

            <Section title="PLATFORM ACTIVITY (30 DAYS)">
              <div className="flex items-end gap-1 h-24">
                {stats.activityDays.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[#D4884A]/70 rounded-t" style={{ height: `${(d.count / maxAct) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }} />
                    {stats.activityDays.length <= 15 && <span className="text-[7px] font-mono text-white/20">{d.date.slice(5)}</span>}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* Venues tab */}
        {tab === "venues" && (
          <Section title="VENUES">
            {showCreate ? (
              <div className="mb-6 p-4 border border-[#D4884A]/30 rounded-xl">
                <p className="text-[10px] font-mono text-white/30 tracking-wider mb-3">NEW VENUE</p>
                <div className="grid md:grid-cols-2 gap-3 mb-3">
                  <input placeholder="Venue name" value={newName} onChange={(e) => { setNewName(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")); }}
                    className="bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none" />
                  <input placeholder="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none" />
                </div>
                {createError && <p className="text-red-400 text-xs font-mono mb-2">{createError}</p>}
                <div className="flex gap-3">
                  <button onClick={createVenue} className="px-6 py-2 rounded-lg text-sm font-mono font-semibold text-[#080808]" style={{ backgroundColor: "#D4884A" }}>Create</button>
                  <button onClick={() => setShowCreate(false)} className="text-white/30 text-sm font-mono hover:text-white">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)} className="mb-4 text-[#D4884A] text-xs font-mono border border-[#D4884A]/30 border-dashed rounded-lg px-4 py-2 hover:bg-[#D4884A]/10 transition">+ Create Venue</button>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">NAME</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">SLUG</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">OWNER</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">CLAIM CODE</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">STATUS</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">EVENTS</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">PAID</th>
                    <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.venues.map((v) => (
                    <tr key={v.id} className="border-b border-white/5">
                      <td className="py-3">
                        <button onClick={() => openVenueDetail(v)} className="text-sm font-mono text-white hover:text-[#D4884A] transition">{v.name}</button>
                      </td>
                      <td className="py-3 text-xs font-mono text-[#D4884A]">/{v.slug}</td>
                      <td className="py-3 text-xs font-mono">
                        {v.ownerSpotifyId && v.ownerSpotifyId !== "unclaimed" ? <span className="text-[#1DB954]">✓ claimed</span> : <span className="text-white/20">unclaimed</span>}
                      </td>
                      <td className="py-3 text-xs font-mono">
                        {v.claimCode && <button onClick={() => navigator.clipboard.writeText(v.claimCode)} className="text-[#D4884A] hover:opacity-70 transition">{v.claimCode} 📋</button>}
                      </td>
                      <td className="py-3">
                        {v.isActive ? <span className="text-[10px] font-mono bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30 px-2 py-0.5 rounded">LIVE</span>
                          : <span className="text-[10px] font-mono bg-white/5 text-white/30 border border-white/10 px-2 py-0.5 rounded">OFF</span>}
                      </td>
                      <td className="py-3 text-xs font-mono text-white/50">{v.eventCount}</td>
                      <td className="py-3">
                        <button onClick={() => togglePaid(v.id, v.isPaid)}
                          className={`text-[10px] font-mono px-3 py-1 rounded transition ${v.isPaid ? "bg-[#D4884A] text-[#080808]" : "border border-white/10 text-white/30 hover:border-[#D4884A]"}`}>
                          {v.isPaid ? "PAID ✓" : "FREE"}
                        </button>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button onClick={() => toggleSuspend(v.id, v.suspended)} className="text-[10px] font-mono text-white/20 hover:text-yellow-400 transition">
                            {v.suspended ? "unsuspend" : "suspend"}
                          </button>
                          <button onClick={() => deleteVenue(v.id, v.name)} className="text-[10px] font-mono text-white/20 hover:text-red-400 transition">delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.venues.length === 0 && <p className="text-white/20 text-center py-8 text-xs font-mono italic">No venues yet</p>}
            </div>
          </Section>
        )}

        {/* Live tab */}
        {tab === "live" && live && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-8">
              <Stat label="Active Lobbies" value={live.lobbyCount} accent />
              <Stat label="Users Online" value={live.totalUsers} />
              <Stat label="Socket Connections" value={live.totalConnections} />
            </div>
            <Section title="ACTIVE LOBBIES">
              {live.activeLobbies.length === 0 ? (
                <p className="text-white/20 text-center py-8 text-xs font-mono italic">No active lobbies</p>
              ) : (
                live.activeLobbies.map((l) => (
                  <div key={l.code} className="flex items-center justify-between py-3 border-b border-white/5">
                    <div>
                      <span className="text-sm font-mono text-white">{l.code}</span>
                      <span className="text-xs font-mono text-white/30 ml-3">host: {l.host || "?"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white/40">{l.userCount} users</span>
                      <div className="flex gap-1">
                        {l.users.map((u) => (
                          <span key={u} className="text-[10px] font-mono bg-white/5 text-white/40 px-2 py-0.5 rounded">{u}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </>
        )}

        {/* Trending tab */}
        {tab === "trending" && trending && (
          <Section title="TRENDING SONGS (7 DAYS)">
            {trending.trending.map((s, i) => (
              <div key={s.spotifyId} className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-white/20 font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{s.title}</p>
                    <p className="text-white/30 truncate italic">{s.artist}</p>
                  </div>
                </div>
                <span className="text-[#D4884A] font-mono ml-4">{s.count}×</span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-[#121210] border border-white/8 rounded-xl p-4">
      <p className="text-[9px] font-mono text-white/30 tracking-wider uppercase mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${accent ? "text-[#D4884A]" : ""}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`mb-6 ${className}`}>
      <h2 className="text-[10px] font-mono text-white/30 tracking-wider uppercase mb-3">{title}</h2>
      <div className="bg-[#121210] border border-white/8 rounded-xl p-5">{children}</div>
    </section>
  );
}
