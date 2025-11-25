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

let TARGET = "Spain";  // Set your target country here or make it dynamic

const WORD_INTERVAL = 2000; // milliseconds

let currentCountry = "";
let players = {};
let playerOrder = [];
let gameStarted = false;

function pickCountry() {
  currentCountry = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  io.emit("newCountry", { country: currentCountry, target: TARGET });
}

function broadcastState(message = "") {
  const scores = Object.values(players).map(p => ({
    name: p.name,
    key: p.key,
    score: p.score
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
  let key = playerOrder.length === 0 ? "x" : "m";

  players[socket.id] = { name, key, score: 0 };
  playerOrder.push(socket.id);

  socket.emit("youAre", { name, key });
  broadcastState(`${name} joined the game`);

  if (playerOrder.length === 2 && !gameStarted) {
    gameStarted = true;
    pickCountry();
    broadcastState("Game started! React when you see " + TARGET);
  }

  socket.on("keyPressed", () => {
    if (!gameStarted) return;
    const player = players[socket.id];
    if (!player) return;

    if (currentCountry === TARGET) {
      player.score++;
      broadcastState(`${player.name} was correct! (+1)`);
    } else {
      player.score--;
      broadcastState(`${player.name} was wrong! (-1)`);
    }
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    delete players[socket.id];
    playerOrder = playerOrder.filter(id => id !== socket.id);
    if (player) broadcastState(`${player.name} left`);

    if (playerOrder.length < 2) {
      gameStarted = false;
      io.emit("newCountry", { country: "---", target: TARGET });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
