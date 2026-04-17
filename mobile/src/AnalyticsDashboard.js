import { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Share, Alert,
  StyleSheet, Animated, ActivityIndicator, Dimensions,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { palette, fonts, radius, glow, space, type } from "./theme";
import { GlassCard, ExposedGrid } from "./Glass";
import { Scarab } from "./Symbols";
import api from "./api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function AnalyticsDashboard({ venue, getToken, onBack }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSection, setExpandedSection] = useState(null);
  const [exporting, setExporting] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentFade, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(contentSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  async function authHeaders() {
    const token = getToken ? await getToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const endpoints = [
          "overview", "peak-hours", "participation", "top-songs",
          "genre-trends", "songs-played", "session-duration",
          "retention", "engagement", "crowd-timeline", "queue-health",
        ];
        const results = await Promise.all(
          endpoints.map((e) => api(`/api/venues/${venue.id}/analytics/${e}`, { headers }).then((r) => r.ok ? r.json() : null))
        );
        if (cancelled) return;
        const keys = ["overview", "peakHours", "participation", "topSongs", "genres", "recentSongs", "sessions", "retention", "engagement", "crowd", "queueHealth"];
        const obj = {};
        keys.forEach((k, i) => { obj[k] = results[i]; });
        setData(obj);
      } catch {
        if (!cancelled) setError("Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [venue.id]);

  async function handleExport() {
    setExporting(true);
    try {
      const headers = await authHeaders();
      const res = await api(`/api/venues/${venue.id}/analytics/export`, { headers });
      const csv = await res.text();
      const fileUri = FileSystem.documentDirectory + `${venue.slug || "venue"}-analytics.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv" });
      } else {
        Alert.alert("Exported", `Saved to ${fileUri}`);
      }
    } catch {
      Alert.alert("Export failed", "Could not export analytics data");
    }
    setExporting(false);
  }

  const { overview, peakHours, participation, topSongs, genres, recentSongs, sessions, retention, engagement, crowd, queueHealth } = data;
  const peakMax = Math.max(1, ...(peakHours?.hours || []).map((h) => h.count));

  // Section definitions for expandable detail
  const sections = [
    {
      key: "overview",
      title: "OVERVIEW",
      render: () => (
        <View style={s.statsGrid}>
          <StatCard label="Songs Played" value={overview?.songsPlayed ?? 0} />
          <StatCard label="Unique Users" value={overview?.uniqueUsers ?? 0} />
          <StatCard label="Votes Cast" value={overview?.totalVotes ?? 0} />
          <StatCard label="Skipped" value={overview?.totalSkips ?? 0} />
          <StatCard label="Avg Session" value={`${sessions?.avgMinutes ?? 0}m`} />
          <StatCard label="Engagement" value={`${engagement?.voteRate ?? 0}%`} />
        </View>
      ),
    },
    {
      key: "peak-hours",
      title: "PEAK HOURS",
      subtitle: "Activity by hour (UTC)",
      render: () => (peakHours?.hours || []).length > 0 ? (
        <View style={s.barChart}>
          {peakHours.hours.map((h) => (
            <View key={h.hour} style={s.barCol}>
              <View style={[s.bar, { height: `${(h.count / peakMax) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }]} />
              <Text style={s.barLabel}>{h.hour}</Text>
            </View>
          ))}
        </View>
      ) : <EmptyState />,
    },
    {
      key: "engagement",
      title: "ENGAGEMENT",
      subtitle: "How actively guests participate",
      render: () => engagement ? (
        <View>
          <View style={s.engRow}><Text style={s.engLabel}>Vote Rate</Text><Text style={s.engValue}>{engagement.voteRate}% of users vote</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Add Rate</Text><Text style={s.engValue}>{engagement.addRate}% add songs</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Avg Votes/User</Text><Text style={s.engValue}>{engagement.avgVotesPerUser}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Avg Adds/User</Text><Text style={s.engValue}>{engagement.avgAddsPerUser}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Total Votes</Text><Text style={s.engValue}>{engagement.totalVotes}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Total Adds</Text><Text style={s.engValue}>{engagement.totalAdds}</Text></View>
        </View>
      ) : <EmptyState />,
    },
    {
      key: "sessions",
      title: "SESSION DURATION",
      subtitle: "How long guests stay engaged",
      render: () => sessions ? (
        <View>
          <View style={s.engRow}><Text style={s.engLabel}>Average</Text><Text style={s.engValue}>{sessions.avgMinutes} min</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Median</Text><Text style={s.engValue}>{sessions.medianMinutes} min</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Total Sessions</Text><Text style={s.engValue}>{sessions.totalSessions}</Text></View>
          <View style={[s.engRow, { marginTop: space.sm }]}>
            <Text style={s.engLabel}>Under 5 min</Text><Text style={s.engValue}>{sessions.buckets?.under5 ?? 0}</Text>
          </View>
          <View style={s.engRow}><Text style={s.engLabel}>5–15 min</Text><Text style={s.engValue}>{sessions.buckets?.["5to15"] ?? 0}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>15–30 min</Text><Text style={s.engValue}>{sessions.buckets?.["15to30"] ?? 0}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>30+ min</Text><Text style={s.engValue}>{sessions.buckets?.["30plus"] ?? 0}</Text></View>
        </View>
      ) : <EmptyState />,
    },
    {
      key: "retention",
      title: "RETENTION",
      subtitle: "New vs returning guests",
      render: () => retention ? (
        <View>
          <View style={s.engRow}><Text style={s.engLabel}>Unique Users</Text><Text style={s.engValue}>{retention.totalUnique}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Returning</Text><Text style={s.engValue}>{retention.returningUsers} ({retention.retentionRate}%)</Text></View>
          {retention.days?.slice(-14).map((d) => (
            <View key={d.date} style={s.retentionRow}>
              <Text style={s.partDate}>{d.date.slice(5)}</Text>
              <View style={s.retentionBars}>
                <View style={[s.retentionNew, { flex: d.newUsers || 0.1 }]} />
                <View style={[s.retentionReturn, { flex: d.returning || 0.1 }]} />
              </View>
              <Text style={s.partCount}>{d.total}</Text>
            </View>
          ))}
        </View>
      ) : <EmptyState />,
    },
    {
      key: "queue-health",
      title: "QUEUE HEALTH",
      subtitle: "Song flow and skip patterns",
      render: () => queueHealth ? (
        <View>
          <View style={s.engRow}><Text style={s.engLabel}>Total Adds</Text><Text style={s.engValue}>{queueHealth.totalAdds}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Total Plays</Text><Text style={s.engValue}>{queueHealth.totalPlays}</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Skip Rate</Text><Text style={s.engValue}>{queueHealth.skipRate}%</Text></View>
          <View style={s.engRow}><Text style={s.engLabel}>Avg Time Between Adds</Text><Text style={s.engValue}>{queueHealth.avgMinutesBetweenAdds} min</Text></View>
        </View>
      ) : <EmptyState />,
    },
    {
      key: "crowd",
      title: "CROWD TIMELINE",
      subtitle: "Lobby size over time (15-min windows)",
      render: () => (crowd?.timeline || []).length > 0 ? (
        <View>
          {crowd.timeline.slice(-20).map((t) => (
            <View key={t.time} style={s.partRow}>
              <Text style={[s.partDate, { width: 80 }]}>{t.time.slice(5)}</Text>
              <View style={s.partBarBg}>
                <View style={[s.partBarFill, { width: `${Math.min(100, (t.userCount / Math.max(1, ...crowd.timeline.map((x) => x.userCount))) * 100)}%` }]} />
              </View>
              <Text style={s.partCount}>{t.userCount}</Text>
            </View>
          ))}
        </View>
      ) : <EmptyState />,
    },
    {
      key: "top-songs",
      title: "TOP SONGS",
      subtitle: "Most popular by play count",
      render: () => topSongs?.songs?.length ? (
        topSongs.songs.slice(0, expandedSection === "top-songs" ? 50 : 10).map((song, i) => (
          <View key={song.spotifyId} style={s.songRow}>
            <Text style={s.songRank}>{String(i + 1).padStart(2, "0")}</Text>
            <View style={s.songInfo}>
              <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
              <Text style={s.songArtist} numberOfLines={1}>{song.artist}</Text>
            </View>
            <Text style={s.songCount}>{song.count}{"\u00D7"}</Text>
          </View>
        ))
      ) : <EmptyState />,
    },
    {
      key: "participation",
      title: "DAILY PARTICIPATION",
      subtitle: "Users per day",
      render: () => {
        const days = participation?.days || [];
        const show = expandedSection === "participation" ? days : days.slice(-14);
        const max = Math.max(1, ...days.map((x) => x.uniqueUsers));
        return show.length ? show.map((d) => (
          <View key={d.date} style={s.partRow}>
            <Text style={s.partDate}>{d.date.slice(5)}</Text>
            <View style={s.partBarBg}>
              <View style={[s.partBarFill, { width: `${(d.uniqueUsers / max) * 100}%` }]} />
            </View>
            <Text style={s.partCount}>{d.uniqueUsers}</Text>
          </View>
        )) : <EmptyState />;
      },
    },
    {
      key: "genres",
      title: "GENRES",
      subtitle: "By song plays",
      render: () => genres?.genres?.length ? (
        <View style={s.chipWrap}>
          {genres.genres.slice(0, expandedSection === "genres" ? 30 : 12).map((g) => (
            <View key={g.genre} style={s.chip}>
              <Text style={s.chipText}>{g.genre}</Text>
              <Text style={s.chipCount}>{g.count}</Text>
            </View>
          ))}
        </View>
      ) : <EmptyState label="Genre data not available" />,
    },
    {
      key: "recent",
      title: "RECENTLY PLAYED",
      subtitle: `Last ${recentSongs?.songs?.length ?? 0} songs`,
      render: () => recentSongs?.songs?.length ? (
        recentSongs.songs.slice(0, expandedSection === "recent" ? 100 : 20).map((song, i) => (
          <View key={`${song.playedAt}-${i}`} style={s.recentRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.recentTitle} numberOfLines={1}>
                {song.title} <Text style={s.recentArtist}>— {song.artist}</Text>
              </Text>
            </View>
            <Text style={s.recentTime}>{new Date(song.playedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        ))
      ) : <EmptyState />,
    },
  ];

  return (
    <View style={s.container}>
      <ExposedGrid />

      <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateX: headerSlide }] }]}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>{"\u2190"}</Text>
        </TouchableOpacity>
        <Scarab size={18} color={palette.amber} style={{ marginRight: space.sm }} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>ANALYTICS</Text>
          <Text style={s.headerTitle}>{venue.name}</Text>
        </View>
        <TouchableOpacity onPress={handleExport} disabled={exporting} activeOpacity={0.7}>
          <Text style={s.exportBtn}>{exporting ? "..." : "EXPORT"}</Text>
        </TouchableOpacity>
      </Animated.View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.amber} /></View>
      ) : error ? (
        <View style={s.center}><Text style={s.errorText}>{error}</Text></View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: contentFade, transform: [{ translateY: contentSlide }] }}>
            {sections.map((sec) => (
              sec.key === "overview" ? (
                <View key={sec.key} style={s.section}>{sec.render()}</View>
              ) : (
                <Section
                  key={sec.key}
                  title={sec.title}
                  subtitle={sec.subtitle}
                  expanded={expandedSection === sec.key}
                  onToggle={() => setExpandedSection(expandedSection === sec.key ? null : sec.key)}
                >
                  {sec.render()}
                </Section>
              )
            ))}
          </Animated.View>
        </ScrollView>
      )}

      {/* Expanded detail modal */}
      {expandedSection && (
        <Modal animationType="slide" transparent={false} visible={true}>
          <View style={s.modalContainer}>
            <ExposedGrid />
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setExpandedSection(null)} activeOpacity={0.7}>
                <Text style={s.backArrow}>{"\u2190"}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>{sections.find((s) => s.key === expandedSection)?.title}</Text>
            </View>
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
              <GlassCard intensity={20} borderRadius={radius.card} style={s.sectionCard}>
                {sections.find((s) => s.key === expandedSection)?.render()}
              </GlassCard>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <GlassCard intensity={30} borderRadius={radius.card} glow={glow.subtle} style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
    </GlassCard>
  );
}

function Section({ title, subtitle, expanded, onToggle, children }) {
  return (
    <View style={s.section}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={s.sectionHeader}>
        <View>
          <Text style={s.sectionTitle}>{title}</Text>
          {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
        </View>
        <Text style={s.expandIcon}>{expanded ? "\u2212" : "+"}</Text>
      </TouchableOpacity>
      <GlassCard intensity={20} borderRadius={radius.card} style={s.sectionCard}>
        {children}
      </GlassCard>
    </View>
  );
}

function EmptyState({ label }) {
  return <Text style={s.emptyText}>{label || "No data yet"}</Text>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.obsidian },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  backArrow: { color: palette.amber, fontSize: 22, fontFamily: fonts.mono, marginRight: space.md },
  headerLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, fontSize: 9 },
  headerTitle: { color: palette.papyrus, fontSize: 16, fontFamily: fonts.monoBold },
  exportBtn: { color: palette.amber, fontSize: 10, fontFamily: fonts.monoBold, letterSpacing: 2, borderWidth: 1, borderColor: palette.amber, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: 60 },
  errorText: { color: palette.scarabRed, fontSize: 13, fontFamily: fonts.mono },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  statCard: { width: (SCREEN_WIDTH - space.lg * 2 - space.sm) / 2 - 1, padding: space.md },
  statLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: space.xs },
  statValue: { color: palette.papyrus, fontSize: 22, fontFamily: fonts.monoBold, fontWeight: "800" },

  section: { marginBottom: space.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm, paddingHorizontal: space.xs },
  sectionTitle: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold },
  sectionSub: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.serifItalic, fontStyle: "italic", marginTop: 1 },
  expandIcon: { color: palette.amber, fontSize: 18, fontFamily: fonts.monoBold },
  sectionCard: { padding: space.md },

  barChart: { flexDirection: "row", alignItems: "flex-end", height: 100, gap: 1 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "100%", backgroundColor: palette.amber, borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.8 },
  barLabel: { color: palette.dust, fontSize: 7, fontFamily: fonts.mono, marginTop: 4 },

  engRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: palette.glassBorder },
  engLabel: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono },
  engValue: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.monoBold },

  songRow: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: palette.glassBorder },
  songRank: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, width: 24 },
  songInfo: { flex: 1, marginRight: space.sm },
  songTitle: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.mono },
  songArtist: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.serifItalic, fontStyle: "italic" },
  songCount: { color: palette.amber, fontSize: 12, fontFamily: fonts.monoBold },

  partRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  partDate: { color: palette.dust, fontSize: 10, fontFamily: fonts.mono, width: 40 },
  partBarBg: { flex: 1, height: 8, backgroundColor: palette.groove, borderRadius: 4, overflow: "hidden", marginHorizontal: space.sm },
  partBarFill: { height: "100%", backgroundColor: palette.amber, borderRadius: 4, opacity: 0.7 },
  partCount: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, width: 24, textAlign: "right" },

  retentionRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  retentionBars: { flex: 1, flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", marginHorizontal: space.sm },
  retentionNew: { backgroundColor: palette.amber, opacity: 0.7 },
  retentionReturn: { backgroundColor: palette.spotifyGreen, opacity: 0.7 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: palette.groove, borderWidth: 1, borderColor: palette.glassBorder, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: palette.papyrus, fontSize: 12, fontFamily: fonts.mono },
  chipCount: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, marginLeft: 6 },

  recentRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  recentTitle: { color: palette.papyrus, fontSize: 12, fontFamily: fonts.mono },
  recentArtist: { color: palette.sandstone },
  recentTime: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, marginLeft: space.sm },

  emptyText: { color: palette.dust, fontSize: 12, fontFamily: fonts.serifItalic, fontStyle: "italic", textAlign: "center", paddingVertical: space.lg },

  modalContainer: { flex: 1, backgroundColor: palette.obsidian },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: space.lg, paddingBottom: space.md },
  modalTitle: { color: palette.papyrus, fontSize: 16, fontFamily: fonts.monoBold, letterSpacing: 2 },
});
