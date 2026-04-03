import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173" },
});

app.use(cors());
app.use(express.json());

// In-memory lobby store (replace with Supabase later)
const lobbies = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// REST routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/lobbies", (_req, res) => {
  const code = generateCode();
  lobbies.set(code, { code, queue: [], users: [], nowPlaying: null });
  res.json({ code });
});

// Socket.io events
io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);
  let currentLobby = null;
  let userName = null;

  socket.on("join-lobby", ({ code, name }) => {
    const lobby = lobbies.get(code);
    if (!lobby) {
      socket.emit("error", "Lobby not found");
      return;
    }
    socket.join(code);
    currentLobby = code;
    userName = name;
    // Prevent duplicate entries on re-join
    if (!lobby.users.some((u) => u.id === socket.id)) {
      lobby.users.push({ id: socket.id, name });
    }
    socket.emit("lobby-state", lobby);
    io.to(code).emit("users-updated", lobby.users);
  });

  socket.on("add-song", ({ code, song }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    lobby.queue.push({
      ...song,
      id: crypto.randomUUID(),
      votes: 0,
      addedBy: userName,
    });
    lobby.queue.sort((a, b) => b.votes - a.votes);
    io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("vote", ({ code, songId, direction }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    const song = lobby.queue.find((s) => s.id === songId);
    if (!song) return;
    song.votes += direction === "up" ? 1 : -1;
    lobby.queue.sort((a, b) => b.votes - a.votes);
    io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("remove-song", ({ code, songId }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    lobby.queue = lobby.queue.filter((s) => s.id !== songId);
    io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("skip", (code) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    if (lobby.queue.length > 0) {
      lobby.nowPlaying = lobby.queue.shift();
      lobby.nowPlaying.votes = 0;
    } else {
      lobby.nowPlaying = null;
    }
    io.to(code).emit("now-playing", lobby.nowPlaying);
    io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    if (currentLobby) {
      const lobby = lobbies.get(currentLobby);
      if (lobby) {
        lobby.users = lobby.users.filter((u) => u.id !== socket.id);
        io.to(currentLobby).emit("users-updated", lobby.users);
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
