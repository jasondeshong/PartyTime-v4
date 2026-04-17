import { useState, useEffect } from "react";
import api from "./api";

export default function VenueDashboard({ venueId, venueName, getToken, onBack }) {
  const [overview, setOverview] = useState(null);
  const [peakHours, setPeakHours] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [topSongs, setTopSongs] = useState(null);
  const [genres, setGenres] = useState(null);
  const [recentSongs, setRecentSongs] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const token = getToken ? await getToken() : null;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const endpoints = [
          "overview",
          "peak-hours",
          "participation",
          "top-songs",
          "genre-trends",
          "songs-played",
        ];
        const [o, p, pa, t, g, s] = await Promise.all(
          endpoints.map((e) =>
            api(`/api/venues/${venueId}/analytics/${e}`, { headers }).then((r) => r.json())
          )
        );
        if (cancelled) return;
        setOverview(o);
        setPeakHours(p);
        setParticipation(pa);
        setTopSongs(t);
        setGenres(g);
        setRecentSongs(s);
      } catch {
        if (!cancelled) setError("Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [venueId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-6">
        <p className="text-red-400/80 text-sm font-mono mb-4">{error}</p>
        <button onClick={onBack} className="text-muted/60 text-xs font-mono tracking-wider hover:text-white">
          ← BACK
        </button>
      </div>
    );
  }

  const peakMax = Math.max(1, ...(peakHours?.hours || []).map((h) => h.count));

  return (
    <div className="min-h-screen bg-bg text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-muted/40 text-[10px] font-mono tracking-wider uppercase mb-1">Analytics</p>
            <h1 className="text-2xl font-bold tracking-tight font-mono">{venueName}</h1>
          </div>
          {onBack && (
            <button onClick={onBack} className="text-muted/60 hover:text-white text-[11px] font-mono tracking-wider">
              ← BACK
            </button>
          )}
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat label="Songs Played" value={overview?.songsPlayed ?? 0} />
          <Stat label="Unique Users" value={overview?.uniqueUsers ?? 0} />
          <Stat label="Votes Cast" value={overview?.totalVotes ?? 0} />
          <Stat label="Songs Skipped" value={overview?.totalSkips ?? 0} />
        </div>

        {/* Peak hours */}
        <Section title="Peak Hours" subtitle="Activity by hour of day (UTC)">
          <div className="flex items-end gap-1 h-32">
            {(peakHours?.hours || []).map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-accent/80 rounded-t"
                  style={{ height: `${(h.count / peakMax) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }}
                />
                <span className="text-[9px] font-mono text-muted/40">{h.hour}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Top songs */}
        <Section title="Top Songs" subtitle="Most popular by play + queue count">
          {topSongs?.songs?.length ? (
            <ul className="space-y-2">
              {topSongs.songs.slice(0, 10).map((s, i) => (
                <li key={s.spotifyId} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-muted/40 text-xs font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{s.title}</p>
                      <p className="text-xs text-muted/50 truncate">{s.artist}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-accent ml-4">{s.count}×</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState label="No song data yet" />}
        </Section>

        {/* Participation */}
        <Section title="Daily Participation" subtitle="Users joining per day">
          {participation?.days?.length ? (
            <ul className="space-y-1">
              {participation.days.slice(-14).map((d) => (
                <li key={d.date} className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-muted/50 w-20">{d.date}</span>
                  <div className="flex-1 bg-surface rounded h-2 overflow-hidden">
                    <div
                      className="bg-accent/70 h-full"
                      style={{ width: `${Math.min(100, (d.uniqueUsers / Math.max(1, Math.max(...participation.days.map(x => x.uniqueUsers)))) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted/60 w-8 text-right">{d.uniqueUsers}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState label="No participation data yet" />}
        </Section>

        {/* Genre trends */}
        <Section title="Genre Breakdown" subtitle="By song plays">
          {genres?.genres?.length ? (
            <div className="flex flex-wrap gap-2">
              {genres.genres.slice(0, 12).map((g) => (
                <div key={g.genre} className="bg-surface border border-border/30 rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-white">{g.genre}</span>
                  <span className="text-muted/50 ml-2 font-mono">{g.count}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState label="Genre data not available (Spotify doesn't expose track genres)" />}
        </Section>

        {/* Recent songs */}
        <Section title="Recently Played" subtitle={`Last ${recentSongs?.songs?.length ?? 0} songs`}>
          {recentSongs?.songs?.length ? (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {recentSongs.songs.slice(0, 50).map((s, i) => (
                <li key={`${s.playedAt}-${i}`} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate">{s.title} <span className="text-muted/50">— {s.artist}</span></p>
                  </div>
                  <span className="text-muted/40 font-mono text-[10px] ml-4 whitespace-nowrap">
                    {new Date(s.playedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState label="No songs played yet" />}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface border border-border/30 rounded-2xl p-4">
      <p className="text-[10px] font-mono text-muted/50 tracking-wider uppercase mb-2">{label}</p>
      <p className="text-2xl font-bold font-mono">{value.toLocaleString()}</p>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted/40 font-mono mt-0.5">{subtitle}</p>}
      </div>
      <div className="bg-surface/40 border border-border/20 rounded-2xl p-5">
        {children}
      </div>
    </section>
  );
}

function EmptyState({ label }) {
  return <p className="text-xs text-muted/40 font-mono py-4 text-center">{label}</p>;
}
