const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// serve static files from 'public' folder
app.use(express.static("public"));

const COUNTRIES = [
  "Spain", "France", "Germany", "Italy", "Portugal",
  "Netherlands", "Belgium", "Greece", "Sweden", "Norway",
  "Denmark", "Poland", "Austria", "Switzerland"
];

let TARGET = "Spain";  // You can make this dynamic if you want
const WORD_INTERVAL = 2000; // milliseconds

let currentCountry = "";
let players = {};
let playerOrder = [];
let gameStarted = false;
let countryAnnounceTime = Date.now();

function pickCountry() {
  currentCountry = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  countryAnnounceTime = Date.now();
  io.emit("newCountry", { country: currentCountry, target: TARGET, ts: countryAnnounceTime });
}

function broadcastState(message = "") {
  const scores = Object.values(players).map(p => ({
    name: p.name,
    score: p.score,
    reactionTime: p.reactionTime || null
  }));
  io.emit("gameState", { scores, message });
}

setInterval(() => {
  if (!gameStarted) return;
  pickCountry();
}, WORD_INTERVAL);

io.on("connection", socket => {
  console.log("New client connected:", socket.id);

  let name = "Player " + (playerOrder.length + 1);

  players[socket.id] = { name, score: 0, reactionTime: null };
  playerOrder.push(socket.id);

  socket.emit("youAre", { name });
  broadcastState(`${name} joined the game`);

  if (playerOrder.length === 2 && !gameStarted) {
    gameStarted = true;

    // Announce target country first
    io.emit("announceTarget", { target: TARGET });

    setTimeout(() => {
      pickCountry();
      broadcastState("Game started! React when you see " + TARGET);
    }, 2000);
  }

  socket.on("keyPressed", ({ reactionTime }) => {
    if (!gameStarted) return;
    const player = players[socket.id];
    if (!player) return;

    player.reactionTime = reactionTime; // Save the latest value
    let msg = "";
    if (currentCountry === TARGET) {
      player.score++;
      msg = `${player.name} was correct! (+1) Reaction time: ${(reactionTime/1000).toFixed(3)}s`;
    } else {
      player.score--;
      msg = `${player.name} was wrong! (-1) Reaction time: ${(reactionTime/1000).toFixed(3)}s`;
    }
    broadcastState(msg);
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    delete players[socket.id];
    playerOrder = playerOrder.filter(id => id !== socket.id);
    if (player) broadcastState(`${player.name} left`);

    if (playerOrder.length < 2) {
      gameStarted = false;
      io.emit("newCountry", { country: "---", target: TARGET, ts: Date.now() });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
