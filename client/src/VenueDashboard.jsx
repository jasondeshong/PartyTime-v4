import { useState, useEffect } from "react";
import api from "./api";

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function VenueDashboard({ venueId, venueName, getToken, onBack }) {
  const [data, setData] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const token = getToken ? await getToken() : null;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const tzParam = `tz=${encodeURIComponent(DEVICE_TZ)}`;
        const endpoints = [
          "overview", "peak-hours", "participation", "top-songs",
          "genre-trends", "songs-played", "session-duration",
          "retention", "engagement", "crowd-timeline", "queue-health",
        ];
        const results = await Promise.all(
          endpoints.map((e) => api(`/api/venues/${venueId}/analytics/${e}?${tzParam}`, { headers }).then((r) => r.ok ? r.json() : null))
        );
        if (cancelled) return;
        const keys = ["overview", "peakHours", "participation", "topSongs", "genres", "recentSongs", "sessions", "retention", "engagement", "crowd", "queueHealth"];
        const obj = {};
        keys.forEach((k, i) => { obj[k] = results[i]; });
        setData(obj);
      } catch { if (!cancelled) setError("Failed to load analytics"); }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [venueId]);

  async function handleExport() {
    try {
      const token = getToken ? await getToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await api(`/api/venues/${venueId}/analytics/export`, { headers });
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${venueName || "venue"}-analytics.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Export failed"); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080808]">
        <div className="w-4 h-4 border-2 border-[#D4884A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#080808] p-6">
        <p className="text-red-400 text-sm font-mono mb-4">{error}</p>
        <button onClick={onBack} className="text-white/40 text-xs font-mono hover:text-white">← BACK</button>
      </div>
    );
  }

  const { overview, peakHours, participation, topSongs, genres, recentSongs, sessions, retention, engagement, crowd, queueHealth } = data;
  const peakMax = Math.max(1, ...(peakHours?.hours || []).map((h) => h.count));

  return (
    <div className="min-h-screen bg-[#080808] text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-white/30 text-[10px] font-mono tracking-wider uppercase mb-1">Analytics</p>
            <h1 className="text-2xl font-bold tracking-tight font-mono">{venueName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleExport} className="text-[#D4884A] text-[10px] font-mono tracking-wider border border-[#D4884A] rounded-lg px-4 py-1.5 hover:bg-[#D4884A]/10 transition">EXPORT CSV</button>
            {onBack && <button onClick={onBack} className="text-white/40 hover:text-white text-[11px] font-mono tracking-wider">← BACK</button>}
          </div>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <Stat label="Songs Played" value={overview?.songsPlayed ?? 0} />
          <Stat label="Unique Users" value={overview?.uniqueUsers ?? 0} />
          <Stat label="Votes Cast" value={overview?.totalVotes ?? 0} />
          <Stat label="Skipped" value={overview?.totalSkips ?? 0} />
          <Stat label="Avg Session" value={`${sessions?.avgMinutes ?? 0}m`} />
          <Stat label="Engagement" value={`${engagement?.voteRate ?? 0}%`} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Peak Hours */}
          <Section title="Peak Hours">
            <div className="flex items-end gap-1 h-32">
              {(peakHours?.hours || []).map((h) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-[#D4884A]/80 rounded-t" style={{ height: `${(h.count / peakMax) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }} />
                  <span className="text-[8px] font-mono text-white/30">{h.hour}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Engagement */}
          <Section title="Engagement">
            {engagement ? (
              <div className="space-y-2">
                <Row label="Vote Rate" value={`${engagement.voteRate}%`} />
                <Row label="Add Rate" value={`${engagement.addRate}%`} />
                <Row label="Avg Votes/User" value={engagement.avgVotesPerUser} />
                <Row label="Avg Adds/User" value={engagement.avgAddsPerUser} />
              </div>
            ) : <Empty />}
          </Section>

          {/* Sessions */}
          <Section title="Session Duration">
            {sessions ? (
              <div className="space-y-2">
                <Row label="Average" value={`${sessions.avgMinutes} min`} />
                <Row label="Median" value={`${sessions.medianMinutes} min`} />
                <Row label="Total Sessions" value={sessions.totalSessions} />
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <MiniStat label="<5m" value={sessions.buckets?.under5 ?? 0} />
                  <MiniStat label="5-15m" value={sessions.buckets?.["5to15"] ?? 0} />
                  <MiniStat label="15-30m" value={sessions.buckets?.["15to30"] ?? 0} />
                  <MiniStat label="30m+" value={sessions.buckets?.["30plus"] ?? 0} />
                </div>
              </div>
            ) : <Empty />}
          </Section>

          {/* Queue Health */}
          <Section title="Queue Health">
            {queueHealth ? (
              <div className="space-y-2">
                <Row label="Total Adds" value={queueHealth.totalAdds} />
                <Row label="Total Plays" value={queueHealth.totalPlays} />
                <Row label="Skip Rate" value={`${queueHealth.skipRate}%`} />
                <Row label="Avg Time Between Adds" value={`${queueHealth.avgMinutesBetweenAdds} min`} />
              </div>
            ) : <Empty />}
          </Section>
        </div>

        {/* Retention */}
        <Section title="Retention" className="mt-6">
          {retention ? (
            <div>
              <div className="flex gap-6 mb-4">
                <Row label="Unique Users" value={retention.totalUnique} />
                <Row label="Returning" value={`${retention.returningUsers} (${retention.retentionRate}%)`} />
              </div>
              <div className="space-y-1">
                {retention.days?.slice(-14).map((d) => (
                  <div key={d.date} className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-white/30 w-16">{d.date.slice(5)}</span>
                    <div className="flex-1 flex h-2 rounded overflow-hidden bg-white/5">
                      <div className="bg-[#D4884A]/70 h-full" style={{ flex: d.newUsers || 0.1 }} />
                      <div className="bg-[#1DB954]/70 h-full" style={{ flex: d.returning || 0.1 }} />
                    </div>
                    <span className="text-white/40 w-6 text-right">{d.total}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-2 text-[10px] font-mono">
                <span className="text-[#D4884A]/70">■ New</span>
                <span className="text-[#1DB954]/70">■ Returning</span>
              </div>
            </div>
          ) : <Empty />}
        </Section>

        {/* Top Songs */}
        <Section title="Top Songs" className="mt-6">
          {topSongs?.songs?.length ? (
            <ul className="space-y-2">
              {topSongs.songs.slice(0, 15).map((s, i) => (
                <li key={s.spotifyId} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-white/25 text-xs font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{s.title}</p>
                      <p className="text-xs text-white/40 truncate italic">{s.artist}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono ml-4" style={{ color: "#D4884A" }}>{s.count}×</span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Section>

        {/* Participation */}
        <Section title="Daily Participation" className="mt-6">
          {participation?.days?.length ? (
            <ul className="space-y-1">
              {participation.days.slice(-14).map((d) => {
                const max = Math.max(1, ...participation.days.map(x => x.uniqueUsers));
                return (
                  <li key={d.date} className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-white/30 w-16">{d.date.slice(5)}</span>
                    <div className="flex-1 bg-white/5 rounded h-2 overflow-hidden">
                      <div className="bg-[#D4884A]/70 h-full" style={{ width: `${(d.uniqueUsers / max) * 100}%` }} />
                    </div>
                    <span className="text-white/40 w-6 text-right">{d.uniqueUsers}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty />}
        </Section>

        {/* Genres */}
        <Section title="Genres" className="mt-6">
          {genres?.genres?.length ? (
            <div className="flex flex-wrap gap-2">
              {genres.genres.slice(0, 15).map((g) => (
                <div key={g.genre} className="bg-white/5 border border-white/8 rounded-xl px-3 py-1.5 text-xs">
                  <span>{g.genre}</span>
                  <span className="text-white/30 ml-2 font-mono">{g.count}</span>
                </div>
              ))}
            </div>
          ) : <Empty label="Genre data not available" />}
        </Section>

        {/* Recently Played */}
        <Section title="Recently Played" className="mt-6 mb-10">
          {recentSongs?.songs?.length ? (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {recentSongs.songs.slice(0, 50).map((s, i) => (
                <li key={`${s.playedAt}-${i}`} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate">{s.title} <span className="text-white/30">— {s.artist}</span></p>
                  </div>
                  <span className="text-white/20 font-mono text-[10px] ml-4 whitespace-nowrap">
                    {new Date(s.playedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-[#121210] border border-white/8 rounded-2xl p-4">
      <p className="text-[9px] font-mono text-white/30 tracking-wider uppercase mb-2">{label}</p>
      <p className="text-xl font-bold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-white/30 text-[9px] font-mono">{label}</p>
      <p className="text-white font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/5">
      <span className="text-white/40 text-xs font-mono">{label}</span>
      <span className="text-white text-sm font-mono font-semibold">{value}</span>
    </div>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={className}>
      <h2 className="text-[10px] font-mono text-white/30 tracking-wider uppercase mb-3">{title}</h2>
      <div className="bg-[#121210] border border-white/8 rounded-2xl p-5">{children}</div>
    </section>
  );
}

function Empty({ label }) {
  return <p className="text-xs text-white/20 font-mono py-4 text-center italic">{label || "No data yet"}</p>;
}
