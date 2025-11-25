const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const COUNTRIES = [
  "Spain", "France", "Germany", "Italy", "Portugal",
  "Netherlands", "Belgium", "Greece", "Sweden", "Norway",
  "Denmark", "Poland", "Austria", "Switzerland"
];

let TARGET = COUNTRIES[0];          // Initialized, will shuffle each round
const WORD_INTERVAL = 2000;         // ms between country names
const ROUND_LENGTH = 20;            // seconds per round

let currentCountry = "";
let players = {};
let playerOrder = [];
let gameStarted = false;
let countryAnnounceTime = Date.now();
let round = 1;
let prevTargetIdx = -1;

// Selects a new target country, never repeats immediate previous target
function selectNewTarget() {
  let idx;
  do {
    idx = Math.floor(Math.random() * COUNTRIES.length);
  } while (idx === prevTargetIdx); // Prevent repeat
  prevTargetIdx = idx;
  return COUNTRIES[idx];
}

function startRound() {
  TARGET = selectNewTarget();
  Object.values(players).forEach(p => { p.reactionTime = null; p.roundScore = 0; });
  io.emit("countdown", { round });
  setTimeout(() => {
    io.emit("announceTarget", { target: TARGET, round }); // Say target country
    setTimeout(() => runRound(), 1200);                   // Start after spoken
  }, 3500);                                               // After countdown
}

function runRound() {
  gameStarted = true;
  let roundEnd = Date.now() + ROUND_LENGTH * 1000;
  let countryInterval = setInterval(() => {
    pickCountry();
    if (Date.now() > roundEnd) {
      clearInterval(countryInterval);
      endRound();
    }
  }, WORD_INTERVAL);
  broadcastState(`Round ${round} started! React when you see "${TARGET}"`);
}

function endRound() {
  gameStarted = false;
  let scores = Object.values(players).map(p => ({ name: p.name, score: p.roundScore || 0 }));
  let maxScore = Math.max(...scores.map(s => s.score));
  let winners = scores.filter(s => s.score === maxScore);
  let winnerText = (winners.length > 1) ? "It's a tie!" : `${winners[0].name} wins the round!`;
  broadcastState(`Round ${round} ended! ${winnerText}`);
  io.emit("newCountry", { country: "---", target: TARGET, ts: Date.now() });
  setTimeout(() => { round += 1; startRound(); }, 4000);
}

function pickCountry() {
  currentCountry = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  countryAnnounceTime = Date.now();
  io.emit("newCountry", { country: currentCountry, target: TARGET, ts: countryAnnounceTime });
}

function broadcastState(message = "") {
  const scores = Object.values(players).map(p => ({
    name: p.name,
    score: p.score,
    roundScore: p.roundScore || 0,
    reactionTime: p.reactionTime || null
  }));
  io.emit("gameState", { scores, message, round, target: TARGET });
}

io.on("connection", socket => {
  let name = "Player " + (playerOrder.length + 1);
  players[socket.id] = { name, score: 0, reactionTime: null, roundScore: 0 };
  playerOrder.push(socket.id);
  socket.emit("youAre", { name });
  broadcastState(`${name} joined the game`);

  if (playerOrder.length === 2 && !gameStarted) {
    round = 1;
    setTimeout(startRound, 500);
  }

  socket.on("keyPressed", ({ reactionTime }) => {
    if (!gameStarted) return;
    const player = players[socket.id];
    if (!player) return;
    player.reactionTime = reactionTime;
    let msg;
    if (currentCountry === TARGET) {
      player.score++;
      player.roundScore++;
      msg = `${player.name} was correct! (+1) Reaction time: ${(reactionTime/1000).toFixed(3)}s`;
    } else {
      player.score--;
      msg = `${player.name} was wrong! (-1) Reaction time: ${(reactionTime/1000).toFixed(3)}s`;
    }
    broadcastState(msg);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    playerOrder = playerOrder.filter(id => id !== socket.id);
    if (playerOrder.length < 2) {
      gameStarted = false;
      io.emit("newCountry", { country: "---", target: TARGET, ts: Date.now() });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
