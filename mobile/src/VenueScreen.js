import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Animated, ActivityIndicator,
} from "react-native";
import { palette, fonts, radius, glow, space, type } from "./theme";
import { GlassCard, ExposedGrid } from "./Glass";
import { ShenRing } from "./Symbols";
import api from "./api";

export default function VenueScreen({ user, getToken, onBack, onViewAnalytics }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [editingVenue, setEditingVenue] = useState(null);
  const [editName, setEditName] = useState("");
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
    loadVenues();
  }, []);

  async function authHeaders() {
    const token = getToken ? await getToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadVenues() {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await api("/api/venues/by-owner", { headers });
      if (res.ok) {
        setVenues(await res.json());
      } else {
        setVenues([]);
      }
    } catch {
      setVenues([]);
    }
    setLoading(false);
  }

  async function createVenue() {
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await api("/api/venues", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      console.log("[Venue] create response:", res.status, JSON.stringify(data));
      if (!res.ok) {
        setError(data.error || "Failed to create venue");
      } else {
        setVenues((prev) => [...prev, data]);
        setName("");
        setSlug("");
        setCreating(false);
      }
    } catch {
      setError("Network error — is the server running?");
    }
    setLoading(false);
  }

  async function updateVenue(id) {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await api(`/api/venues/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVenues((prev) => prev.map((v) => (v.id === id ? updated : v)));
        setEditingVenue(null);
      }
    } catch {}
    setLoading(false);
  }

  async function deleteVenue(id, venueName) {
    Alert.alert("Delete Venue", `Remove "${venueName}" and its lobby?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const headers = await authHeaders();
            await api(`/api/venues/${id}`, { method: "DELETE", headers });
            setVenues((prev) => prev.filter((v) => v.id !== id));
          } catch {}
        },
      },
    ]);
  }

  function autoSlug(text) {
    setName(text);
    if (!editingVenue) {
      setSlug(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
      );
    }
  }

  return (
    <View style={s.container}>
      <ExposedGrid />

      <Animated.View
        style={[s.header, { opacity: headerFade, transform: [{ translateX: headerSlide }] }]}
      >
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>{"\u2190"}</Text>
        </TouchableOpacity>
        <ShenRing size={20} color={palette.amber} style={{ marginRight: space.sm }} />
        <Text style={s.headerTitle}>VENUES</Text>
      </Animated.View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: contentFade, transform: [{ translateY: contentSlide }] }}>

          {/* Create new venue */}
          {!creating ? (
            <TouchableOpacity style={s.createBtn} onPress={() => setCreating(true)} activeOpacity={0.8}>
              <Text style={s.createBtnText}>+ Create Venue</Text>
            </TouchableOpacity>
          ) : (
            <GlassCard intensity={30} borderRadius={radius.card} style={s.card}>
              <Text style={s.sectionLabel}>NEW VENUE</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={autoSlug}
                placeholder="Venue name"
                placeholderTextColor={palette.dust}
                autoFocus
              />
              <View style={s.slugRow}>
                <Text style={s.slugPrefix}>partytime.app/</Text>
                <TextInput
                  style={[s.input, s.slugInput]}
                  value={slug}
                  onChangeText={(t) => setSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="slug"
                  placeholderTextColor={palette.dust}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {error ? <Text style={s.error}>{error}</Text> : null}
              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setCreating(false); setError(""); }} activeOpacity={0.7}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={createVenue} activeOpacity={0.8}>
                  <Text style={s.saveBtnText}>Create</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}

          {/* Venue list */}
          <Text style={[s.sectionLabel, { marginTop: space.lg }]}>YOUR VENUES</Text>

          {loading && venues.length === 0 ? (
            <ActivityIndicator color={palette.amber} style={{ marginTop: space.lg }} />
          ) : venues.length === 0 ? (
            <Text style={s.emptyText}>No venues yet — create one above</Text>
          ) : (
            venues.map((venue) => (
              <GlassCard key={venue.id} intensity={30} borderRadius={radius.card} glow={glow.subtle} style={[s.card, { marginBottom: space.md }]}>
                {editingVenue === venue.id ? (
                  <View>
                    <TextInput
                      style={s.input}
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => updateVenue(venue.id)}
                    />
                    <View style={s.btnRow}>
                      <TouchableOpacity onPress={() => setEditingVenue(null)} activeOpacity={0.7}>
                        <Text style={s.cancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.saveBtn} onPress={() => updateVenue(venue.id)} activeOpacity={0.8}>
                        <Text style={s.saveBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={s.venueName}>{venue.name}</Text>
                    <Text style={s.venueSlug}>/{venue.slug}</Text>
                    <Text style={s.venueCode}>Lobby: {venue.lobbyCode}</Text>
                    <View style={s.venueActions}>
                      <TouchableOpacity onPress={() => onViewAnalytics(venue)} activeOpacity={0.7}>
                        <Text style={s.actionText}>Analytics</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingVenue(venue.id); setEditName(venue.name); }} activeOpacity={0.7}>
                        <Text style={s.actionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteVenue(venue.id, venue.name)} activeOpacity={0.7}>
                        <Text style={s.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </GlassCard>
            ))
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.obsidian },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  backArrow: { color: palette.amber, fontSize: 22, fontFamily: fonts.mono, marginRight: space.md },
  headerTitle: { color: palette.papyrus, fontSize: 16, fontFamily: fonts.monoBold, letterSpacing: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: 60 },
  sectionLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: space.sm, marginLeft: space.xs },
  card: { padding: space.md },
  input: {
    color: palette.papyrus,
    fontSize: 14,
    fontFamily: fonts.mono,
    borderBottomWidth: 1,
    borderBottomColor: palette.glassBorder,
    paddingVertical: space.sm,
    marginBottom: space.sm,
  },
  slugRow: { flexDirection: "row", alignItems: "center" },
  slugPrefix: { color: palette.dust, fontSize: 12, fontFamily: fonts.mono, marginRight: 2 },
  slugInput: { flex: 1 },
  error: { color: palette.scarabRed, fontSize: 12, fontFamily: fonts.mono, marginBottom: space.sm },
  btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: space.md, marginTop: space.sm },
  cancelBtn: { paddingVertical: space.sm, paddingHorizontal: space.md },
  cancelText: { color: palette.dust, fontSize: 13, fontFamily: fonts.mono },
  saveBtn: { backgroundColor: palette.amber, paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.button },
  saveBtnText: { color: palette.obsidian, fontSize: 13, fontFamily: fonts.monoBold, fontWeight: "700" },
  createBtn: {
    borderWidth: 1,
    borderColor: palette.amber,
    borderStyle: "dashed",
    borderRadius: radius.card,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: space.md,
  },
  createBtnText: { color: palette.amber, fontSize: 14, fontFamily: fonts.monoBold, letterSpacing: 1 },
  emptyText: { color: palette.dust, fontSize: 13, fontFamily: fonts.serifItalic, fontStyle: "italic", textAlign: "center", marginTop: space.lg },
  venueName: { color: palette.papyrus, fontSize: 17, fontFamily: fonts.monoBold, marginBottom: 2 },
  venueSlug: { color: palette.amber, fontSize: 12, fontFamily: fonts.mono, marginBottom: 4 },
  venueCode: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 2, marginBottom: space.sm },
  venueActions: { flexDirection: "row", gap: space.lg, marginTop: space.xs },
  actionText: { color: palette.amber, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1 },
  deleteText: { color: palette.scarabRed, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1 },
});
