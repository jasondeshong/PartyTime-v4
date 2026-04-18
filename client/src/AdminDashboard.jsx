import { useState, useEffect } from "react";
import api from "./api";
import { Sistrum } from "./Symbols";

export default function AdminDashboard() {
  const [password, setPassword] = useState(localStorage.getItem("pt_admin") || "");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/api/admin/stats", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        localStorage.setItem("pt_admin", password);
        setStats(await res.json());
        setAuthed(true);
      } else {
        setError("Wrong password");
      }
    } catch { setError("Server unreachable"); }
    setLoading(false);
  }

  async function refresh() {
    try {
      const res = await api("/api/admin/stats", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) setStats(await res.json());
    } catch {}
  }

  async function togglePaid(venueId, currentlyPaid) {
    await api(`/api/admin/venues/${venueId}/set-paid`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${password}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isPaid: !currentlyPaid }),
    });
    refresh();
  }

  useEffect(() => {
    if (password && !authed) login();
  }, []);

  const scanLineBg = `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(240,236,228,0.02) 3px, rgba(240,236,228,0.02) 4px)`;
  const gridBg = `repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px), repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px)`;

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative" style={{ backgroundColor: "#080808" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanLineBg }} />
        <Sistrum size={40} />
        <h1 className="text-xl font-bold text-white mt-4 mb-1 font-mono tracking-wider relative z-10">ADMIN</h1>
        <p className="text-white/30 text-xs italic mb-8 relative z-10">PartyTime command center</p>
        <div className="w-full max-w-xs relative z-10">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full bg-[#121210] border border-white/8 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#D4884A]/30 text-center font-mono mb-3"
          />
          <button onClick={login} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-[#080808] hover:opacity-90 transition"
            style={{ backgroundColor: "#D4884A" }}>
            {loading ? "..." : "Enter"}
          </button>
          {error && <p className="text-red-400 text-xs text-center mt-3 font-mono">{error}</p>}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const maxActivity = Math.max(1, ...stats.activityDays.map((d) => d.count));

  return (
    <div className="min-h-screen text-white p-6 md:p-10 relative" style={{ backgroundColor: "#080808" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanLineBg }} />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Sistrum size={28} />
            <div>
              <h1 className="text-xl font-bold font-mono tracking-wider">ADMIN</h1>
              <p className="text-white/30 text-[10px] font-mono tracking-wider">PARTYTIME COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={refresh} className="text-[#D4884A] text-xs font-mono border border-[#D4884A] rounded-lg px-4 py-1.5 hover:bg-[#D4884A]/10 transition">REFRESH</button>
            <button onClick={() => { setAuthed(false); localStorage.removeItem("pt_admin"); }} className="text-white/30 text-xs font-mono hover:text-white transition">LOGOUT</button>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-10">
          <Stat label="Total Venues" value={stats.totalVenues} />
          <Stat label="Paid Venues" value={stats.paidVenues} accent />
          <Stat label="Active Now" value={stats.activeVenues} />
          <Stat label="Active Lobbies" value={stats.activeLobbies} />
          <Stat label="Unique Users" value={stats.uniqueUsers} />
          <Stat label="Songs Played" value={stats.totalSongsPlayed} />
          <Stat label="Votes Cast" value={stats.totalVotes} />
          <Stat label="Total Events" value={stats.totalEvents} />
          <Stat label="Total Lobbies" value={stats.totalLobbies} />
          <Stat label="B2C Limit" value="10 users" />
        </div>

        {/* Activity chart */}
        <Section title="PLATFORM ACTIVITY (30 DAYS)">
          <div className="flex items-end gap-1 h-24">
            {stats.activityDays.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-[#D4884A]/70 rounded-t" style={{ height: `${(d.count / maxActivity) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }} />
                {stats.activityDays.length <= 15 && <span className="text-[7px] font-mono text-white/20">{d.date.slice(5)}</span>}
              </div>
            ))}
          </div>
        </Section>

        {/* Venue management */}
        <Section title="VENUES">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">NAME</th>
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">SLUG</th>
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">STATUS</th>
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">EVENTS</th>
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">CREATED</th>
                  <th className="py-2 text-[10px] font-mono text-white/30 tracking-wider">PAID</th>
                </tr>
              </thead>
              <tbody>
                {stats.venues.map((v) => (
                  <tr key={v.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="py-3 text-sm font-mono">{v.name}</td>
                    <td className="py-3 text-xs font-mono text-[#D4884A]">/{v.slug}</td>
                    <td className="py-3">
                      {v.isActive ? (
                        <span className="text-[10px] font-mono bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30 px-2 py-0.5 rounded">LIVE</span>
                      ) : (
                        <span className="text-[10px] font-mono bg-white/5 text-white/30 border border-white/10 px-2 py-0.5 rounded">OFF</span>
                      )}
                    </td>
                    <td className="py-3 text-xs font-mono text-white/50">{v.eventCount}</td>
                    <td className="py-3 text-xs font-mono text-white/30">{v.createdAt?.slice(0, 10)}</td>
                    <td className="py-3">
                      <button
                        onClick={() => togglePaid(v.id, v.isPaid)}
                        className={`text-[10px] font-mono px-3 py-1 rounded transition ${
                          v.isPaid
                            ? "bg-[#D4884A] text-[#080808] hover:opacity-80"
                            : "border border-white/10 text-white/30 hover:border-[#D4884A] hover:text-[#D4884A]"
                        }`}
                      >
                        {v.isPaid ? "PAID ✓" : "FREE"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.venues.length === 0 && (
              <p className="text-white/20 text-center py-8 text-xs font-mono italic">No venues yet</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-[#121210] border border-white/8 rounded-xl p-4">
      <p className="text-[9px] font-mono text-white/30 tracking-wider uppercase mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${accent ? "text-[#D4884A]" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-[10px] font-mono text-white/30 tracking-wider uppercase mb-3">{title}</h2>
      <div className="bg-[#121210] border border-white/8 rounded-xl p-5">{children}</div>
    </section>
  );
}
