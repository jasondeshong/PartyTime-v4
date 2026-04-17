import { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, ActivityIndicator, Dimensions,
} from "react-native";
import { palette, fonts, radius, glow, space, type } from "./theme";
import { GlassCard, ExposedGrid } from "./Glass";
import { Scarab } from "./Symbols";
import api from "./api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function AnalyticsDashboard({ venue, onBack }) {
  const [overview, setOverview] = useState(null);
  const [peakHours, setPeakHours] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [topSongs, setTopSongs] = useState(null);
  const [genres, setGenres] = useState(null);
  const [recentSongs, setRecentSongs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const endpoints = ["overview", "peak-hours", "participation", "top-songs", "genre-trends", "songs-played"];
        const results = await Promise.all(
          endpoints.map((e) => api(`/api/venues/${venue.id}/analytics/${e}`).then((r) => r.json()))
        );
        if (cancelled) return;
        setOverview(results[0]);
        setPeakHours(results[1]);
        setParticipation(results[2]);
        setTopSongs(results[3]);
        setGenres(results[4]);
        setRecentSongs(results[5]);
      } catch {
        if (!cancelled) setError("Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [venue.id]);

  const peakMax = Math.max(1, ...(peakHours?.hours || []).map((h) => h.count));

  return (
    <View style={s.container}>
      <ExposedGrid />

      <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateX: headerSlide }] }]}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>{"\u2190"}</Text>
        </TouchableOpacity>
        <Scarab size={18} color={palette.amber} style={{ marginRight: space.sm }} />
        <View>
          <Text style={s.headerLabel}>ANALYTICS</Text>
          <Text style={s.headerTitle}>{venue.name}</Text>
        </View>
      </Animated.View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={palette.amber} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: contentFade, transform: [{ translateY: contentSlide }] }}>

            {/* Overview stats */}
            <View style={s.statsGrid}>
              <StatCard label="Songs Played" value={overview?.songsPlayed ?? 0} />
              <StatCard label="Unique Users" value={overview?.uniqueUsers ?? 0} />
              <StatCard label="Votes Cast" value={overview?.totalVotes ?? 0} />
              <StatCard label="Skipped" value={overview?.totalSkips ?? 0} />
            </View>

            {/* Peak Hours */}
            <Section title="PEAK HOURS" subtitle="Activity by hour (UTC)">
              {(peakHours?.hours || []).length > 0 ? (
                <View style={s.barChart}>
                  {peakHours.hours.map((h) => (
                    <View key={h.hour} style={s.barCol}>
                      <View style={[s.bar, { height: `${(h.count / peakMax) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }]} />
                      <Text style={s.barLabel}>{h.hour}</Text>
                    </View>
                  ))}
                </View>
              ) : <EmptyState />}
            </Section>

            {/* Top Songs */}
            <Section title="TOP SONGS" subtitle="Most popular by play count">
              {topSongs?.songs?.length ? (
                topSongs.songs.slice(0, 10).map((song, i) => (
                  <View key={song.spotifyId} style={s.songRow}>
                    <Text style={s.songRank}>{String(i + 1).padStart(2, "0")}</Text>
                    <View style={s.songInfo}>
                      <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
                      <Text style={s.songArtist} numberOfLines={1}>{song.artist}</Text>
                    </View>
                    <Text style={s.songCount}>{song.count}\u00D7</Text>
                  </View>
                ))
              ) : <EmptyState />}
            </Section>

            {/* Participation */}
            <Section title="DAILY PARTICIPATION" subtitle="Users per day">
              {participation?.days?.length ? (
                participation.days.slice(-14).map((d) => {
                  const max = Math.max(1, ...participation.days.map((x) => x.uniqueUsers));
                  return (
                    <View key={d.date} style={s.partRow}>
                      <Text style={s.partDate}>{d.date.slice(5)}</Text>
                      <View style={s.partBarBg}>
                        <View style={[s.partBarFill, { width: `${(d.uniqueUsers / max) * 100}%` }]} />
                      </View>
                      <Text style={s.partCount}>{d.uniqueUsers}</Text>
                    </View>
                  );
                })
              ) : <EmptyState />}
            </Section>

            {/* Genre Trends */}
            <Section title="GENRES" subtitle="By song plays">
              {genres?.genres?.length ? (
                <View style={s.chipWrap}>
                  {genres.genres.slice(0, 12).map((g) => (
                    <View key={g.genre} style={s.chip}>
                      <Text style={s.chipText}>{g.genre}</Text>
                      <Text style={s.chipCount}>{g.count}</Text>
                    </View>
                  ))}
                </View>
              ) : <EmptyState label="Genre data not available" />}
            </Section>

            {/* Recently Played */}
            <Section title="RECENTLY PLAYED" subtitle={`Last ${recentSongs?.songs?.length ?? 0} songs`}>
              {recentSongs?.songs?.length ? (
                recentSongs.songs.slice(0, 30).map((song, i) => (
                  <View key={`${song.playedAt}-${i}`} style={s.recentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recentTitle} numberOfLines={1}>
                        {song.title} <Text style={s.recentArtist}>— {song.artist}</Text>
                      </Text>
                    </View>
                    <Text style={s.recentTime}>{new Date(song.playedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                ))
              ) : <EmptyState />}
            </Section>

          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <GlassCard intensity={30} borderRadius={radius.card} glow={glow.subtle} style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{(value || 0).toLocaleString()}</Text>
    </GlassCard>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: 60 },
  errorText: { color: palette.scarabRed, fontSize: 13, fontFamily: fonts.mono },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  statCard: { width: (SCREEN_WIDTH - space.lg * 2 - space.sm) / 2 - 1, padding: space.md },
  statLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: space.xs },
  statValue: { color: palette.papyrus, fontSize: 24, fontFamily: fonts.monoBold, fontWeight: "800" },

  // Sections
  section: { marginBottom: space.lg },
  sectionTitle: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: 2, marginLeft: space.xs },
  sectionSub: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.serifItalic, fontStyle: "italic", marginBottom: space.sm, marginLeft: space.xs },
  sectionCard: { padding: space.md },

  // Bar chart
  barChart: { flexDirection: "row", alignItems: "flex-end", height: 100, gap: 1 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "100%", backgroundColor: palette.amber, borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.8 },
  barLabel: { color: palette.dust, fontSize: 7, fontFamily: fonts.mono, marginTop: 4 },

  // Song rows
  songRow: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: palette.glassBorder },
  songRank: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, width: 24 },
  songInfo: { flex: 1, marginRight: space.sm },
  songTitle: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.mono },
  songArtist: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.serifItalic, fontStyle: "italic" },
  songCount: { color: palette.amber, fontSize: 12, fontFamily: fonts.monoBold },

  // Participation bars
  partRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  partDate: { color: palette.dust, fontSize: 10, fontFamily: fonts.mono, width: 40 },
  partBarBg: { flex: 1, height: 8, backgroundColor: palette.groove, borderRadius: 4, overflow: "hidden", marginHorizontal: space.sm },
  partBarFill: { height: "100%", backgroundColor: palette.amber, borderRadius: 4, opacity: 0.7 },
  partCount: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, width: 24, textAlign: "right" },

  // Genre chips
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: palette.groove, borderWidth: 1, borderColor: palette.glassBorder, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: palette.papyrus, fontSize: 12, fontFamily: fonts.mono },
  chipCount: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, marginLeft: 6 },

  // Recent songs
  recentRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  recentTitle: { color: palette.papyrus, fontSize: 12, fontFamily: fonts.mono },
  recentArtist: { color: palette.sandstone },
  recentTime: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, marginLeft: space.sm },

  emptyText: { color: palette.dust, fontSize: 12, fontFamily: fonts.serifItalic, fontStyle: "italic", textAlign: "center", paddingVertical: space.lg },
});
