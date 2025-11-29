const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Example flag data: array of {country, flagURL}
const FLAGS = [
  { country: "France", flag: "https://flagcdn.com/fr.svg" },
  { country: "Brazil", flag: "https://flagcdn.com/br.svg" },
  { country: "Japan", flag: "https://flagcdn.com/jp.svg" },
  { country: "Kenya", flag: "https://flagcdn.com/ke.svg" }
];

let rooms = {};

function getRandomFlag() {
  return FLAGS[Math.floor(Math.random() * FLAGS.length)];
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        scores: [0, 0],
        round: 1,
        currentFlag: null,
        answering: false
      };
    }
    const room = rooms[roomId];
    if (room.players.length < 2 && !room.players.includes(socket.id)) {
      room.players.push(socket.id);
    }
    io.to(roomId).emit('playerCount', room.players.length);

    if (room.players.length === 2 && !room.answering) {
      startRound(roomId);
    }
  });

  socket.on('answer', ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || !room.answering) return;
    if (!room.players.includes(socket.id)) return;

    if (room.firstAnswered) return; // Already answered this round

    room.firstAnswered = socket.id;

    const correctCountry = room.currentFlag.country.toLowerCase();
    const givenAnswer = answer.trim().toLowerCase();

    if (givenAnswer === correctCountry) {
      // Correct answer - player wins point
      updateScore(room, socket.id, true);
    } else {
      // Wrong answer - point to opponent
      updateScore(room, socket.id, false);
    }
    room.answering = false;
    io.to(roomId).emit('roundResult', {
      winnerId: room.winnerId,
      correctCountry: room.currentFlag.country,
      scores: room.scores,
      round: room.round
    });

    if (checkGameOver(room)) {
      io.to(roomId).emit('gameOver', { scores: room.scores });
    } else {
      setTimeout(() => startRound(roomId), 3000);
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(id => id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('playerCount', room.players.length);
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.currentFlag = getRandomFlag();
  room.round += room.round <= 3 || room.scores[0] === room.scores[1] ? 1 : 0;
  room.firstAnswered = null;
  room.answering = true;
  room.winnerId = null;

  io.to(roomId).emit('newRound', {
    flagURL: room.currentFlag.flag,
    round: room.round,
    scores: room.scores,
  });

  // 10 second timeout for round
  setTimeout(() => {
    if (room.answering) {
      // Timeout no answer: 0 points each
      room.answering = false;
      io.to(roomId).emit('roundResult', {
        winnerId: null,
        correctCountry: room.currentFlag.country,
        scores: room.scores,
        round: room.round
      });
      if (checkTimeoutRound(room)) {
        startRound(roomId);
      } else {
        io.to(roomId).emit('gameOver', { scores: room.scores });
      }
    }
  }, 10000);
}

function updateScore(room, answeringPlayerId, isCorrect) {
  const idx = room.players.indexOf(answeringPlayerId);
  if (isCorrect) {
    room.scores[idx]++;
    room.winnerId = answeringPlayerId;
  } else {
    const otherIdx = idx === 0 ? 1 : 0;
    room.scores[otherIdx]++;
    room.winnerId = room.players[otherIdx];
  }
}

function checkGameOver(room) {
  // Game over if 2-0 or if 3 rounds played and no tie
  if (room.scores[0] === 2 || room.scores[1] === 2) return true;
  if (room.round === 3 && room.scores[0] !== room.scores[1]) return true;
  return false;
}

function checkTimeoutRound(room) {
  // If round 3 timeout and tied scores -> round 4 sudden death
  if (room.round === 3 && room.scores[0] === room.scores[1]) {
    room.round = 4;
    return true;
  }
  return false;
}

app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
