import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Test connection
const { data, error } = await supabase.from("lobbies").select("code").limit(1);

if (error && error.code === "42P01") {
  console.log("Tables don't exist yet. Please create them in the Supabase SQL editor.");
  console.log(`
Run this SQL in your Supabase dashboard (SQL Editor):

-- Lobbies table
CREATE TABLE lobbies (
  code TEXT PRIMARY KEY,
  now_playing JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Queue table
CREATE TABLE queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code TEXT REFERENCES lobbies(code) ON DELETE CASCADE,
  spotify_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  album_art TEXT,
  preview_url TEXT,
  duration INTEGER,
  votes INTEGER DEFAULT 0,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queue lookups
CREATE INDEX idx_queue_lobby ON queue(lobby_code);

-- RPC function for atomic vote increment
CREATE OR REPLACE FUNCTION increment_votes(song_id UUID, delta INTEGER)
RETURNS VOID AS $$
  UPDATE queue SET votes = votes + delta WHERE id = song_id;
$$ LANGUAGE SQL;

-- Enable RLS but allow all operations for anon (MVP)
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on lobbies" ON lobbies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on queue" ON queue FOR ALL USING (true) WITH CHECK (true);
  `);
} else if (error) {
  console.error("Connection error:", error);
} else {
  console.log("Tables already exist! Connection successful.");
  console.log("Found", data.length, "lobbies");
}
