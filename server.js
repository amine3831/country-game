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

const WINNING_SCORE = 2;   // First to 2 points wins match
const WORD_INTERVAL = 2000;     // ms
const ROUND_LENGTH = 20;        // seconds

let TARGET = COUNTRIES[0];
let prevTargetIdx = -1;
let currentCountry = "";
let players = {};
let playerOrder = [];
let gameStarted = false;
let countryAnnounceTime = Date.now();
let round = 1;

function selectNewTarget() {
  let idx;
  do {
    idx = Math.floor(Math.random() * COUNTRIES.length);
  } while (idx === prevTargetIdx); // No repeat
  prevTargetIdx = idx;
  return COUNTRIES[idx];
}

function startRound() {
  TARGET = selectNewTarget();
  Object.values(players).forEach(p => { p.reactionTime = null; p.roundScore = 0; p.hasReacted = false; });
  io.emit("countdown", { round });
  setTimeout(() => {
    io.emit("announceTarget", { target: TARGET, round });
    setTimeout(() => runRound(), 1200);
  }, 3500);
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
  broadcastState(`Round ${round} started! Listen for "${TARGET}"`);
}

function endRound() {
  gameStarted = false;
  let scores = Object.values(players).map(p => ({ id: p.id, name: p.name, score: p.roundScore || 0 }));
  let maxScore = Math.max(...scores.map(s => s.score));
  let winners = scores.filter(s => s.score === maxScore && maxScore > 0);
  let winnerText = "No points awarded!";
  // Add match point for round winner
  if (winners.length === 1) {
    let winnerPlayer = Object.values(players).find(p => p.name === winners[0].name);
    winnerPlayer.matchScore = (winnerPlayer.matchScore || 0) + 1;
    winnerText = `${winnerPlayer.name} wins the round and scores a point!`;
  } else if (winners.length > 1) {
    winnerText = "It's a tie!";
  }
  broadcastState(`Round ${round} ended! ${winnerText}`);
  io.emit("newCountry", { country: "---", target: TARGET, ts: Date.now() });

  // Check for match winner
  let matchWinner = Object.values(players).find(p => (p.matchScore || 0) >= WINNING_SCORE);
  if (matchWinner) {
    broadcastState(`${matchWinner.name} wins the game!`);
    gameStarted = false;
    setTimeout(() => process.exit(), 7000); // Or reset game state if desired
    return;
  }
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
    matchScore: p.matchScore || 0,
    roundScore: p.roundScore || 0,
    reactionTime: p.reactionTime || null
  }));
  io.emit("gameState", { scores, message, round, target: TARGET });
}

// Track only first reaction per player per country
io.on("connection", socket => {
  let name = "Player " + (playerOrder.length + 1);
  players[socket.id] = { id: socket.id, name, matchScore: 0, score: 0, reactionTime: null, roundScore: 0, hasReacted: false };
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
    if (!player || player.hasReacted) return;
    player.hasReacted = true;
    player.reactionTime = reactionTime;
    let msg;
    // Correct player: record a point for round score ONLY for correct answer
    if (currentCountry === TARGET) {
      player.roundScore++;
      msg = `${player.name} was correct! (+1 round point)`;
    } else {
      // Penalize, point to opponent
      let others = Object.values(players).filter(p => p.id !== socket.id);
      if (others.length === 1) {
        others[0].matchScore = (others[0].matchScore || 0) + 1;
        msg = `${player.name} false start! ${others[0].name} gains a match point!`;
      }
      else msg = `${player.name} false start!`;
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
