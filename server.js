// Server Dependencies
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const flagData = require('./flag_data.json'); // Your question bank

const PORT = process.env.PORT || 3000;

// --- GAME STATE ---
let waitingPlayer = null;
let activeMatches = {}; 

// Serve static files (index.html)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- CORE GAME LOGIC ---

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // --- 1. MATCHMAKING ---
    if (waitingPlayer) {
        // Start Game
        const matchId = socket.id + waitingPlayer.id;
        activeMatches[matchId] = createNewMatch(waitingPlayer.id, socket.id, matchId);
        
        // Notify both players
        io.to(waitingPlayer.id).emit('match_found', { opponentId: socket.id, matchId: matchId, isP1: true });
        socket.emit('match_found', { opponentId: waitingPlayer.id, matchId: matchId, isP1: false });
        
        startGameRound(matchId, 1);
        waitingPlayer = null;
    } else {
        // Wait for opponent
        waitingPlayer = socket;
        socket.emit('waiting_for_opponent');
    }

    // --- 2. RECEIVE ANSWER ---
    socket.on('submit_answer', (data) => {
        const match = activeMatches[data.matchId];
        if (!match) return; 

        const playerKey = (match.p1 === socket.id) ? 'p1' : 'p2';
        
        // Only allow answer if player hasn't answered yet
        if (!match.roundAnswers[playerKey]) {
            match.roundAnswers[playerKey] = {
                answer: data.answer,
                time: Date.now() // Server-side timestamp for accuracy
            };
            
            // If both players have answered, calculate scores
            if (match.roundAnswers.p1 && match.roundAnswers.p2) {
                calculateScores(match.matchId);
            }
        }
    });

    // --- 3. DISCONNECT ---
    socket.on('disconnect', () => {
        // Basic match cleanup
        for (const id in activeMatches) {
            const match = activeMatches[id];
            if (match.p1 === socket.id || match.p2 === socket.id) {
                const opponentId = match.p1 === socket.id ? match.p2 : match.p1;
                io.to(opponentId).emit('opponent_disconnected', 'Your opponent disconnected. You win!');
                delete activeMatches[id];
                break;
            }
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        console.log(`Player disconnected: ${socket.id}`);
    });
});


// --- GAME HELPER FUNCTIONS ---

function createNewMatch(p1Id, p2Id, matchId) {
    return {
        matchId,
        p1: p1Id,
        p2: p2Id,
        currentRound: 0,
        scores: { [p1Id]: 0, [p2Id]: 0 },
        currentQuestion: null,
        roundAnswers: { p1: null, p2: null },
        roundStartTime: null // Added for time calculation
    };
}

function startGameRound(matchId, roundNumber) {
    const match = activeMatches[matchId];
    if (!match) return; // Should not happen

    match.currentRound = roundNumber;
    match.roundStartTime = Date.now(); // Record start time
    
    // Pick a question (simplified: based on round number, or random for tiebreakers)
    const questionIndex = (roundNumber <= 3) ? (roundNumber - 1) : Math.floor(Math.random() * flagData.length);
    
    // Ensure we have enough data (if not, use a random question)
    const question = flagData[questionIndex] || flagData[Math.floor(Math.random() * flagData.length)];
    
    match.currentQuestion = question;
    match.roundAnswers = { p1: null, p2: null }; // Reset answers

    // Broadcast the new question to both players
    const questionData = {
        questionId: question.id,
        image: question.image,
        options: question.options,
        round: roundNumber,
        isTiebreaker: roundNumber >= 4
    };
    io.to(match.p1).emit('new_round', questionData);
    io.to(match.p2).emit('new_round', questionData);
}

function calculateScores(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    const q = match.currentQuestion;
    const ansP1 = match.roundAnswers.p1;
    const ansP2 = match.roundAnswers.p2;

    let roundWinner = null;
    let p1Correct = (ansP1 && ansP1.answer === q.correctAnswer);
    let p2Correct = (ansP2 && ansP2.answer === q.correctAnswer);
    
    // 1. Determine the winner for the single point (Correct AND Fastest)
    if (p1Correct && p2Correct) {
        // Both correct, point goes to the fastest
        roundWinner = (ansP1.time < ansP2.time) ? match.p1 : match.p2;
    } else if (p1Correct) {
        roundWinner = match.p1; // Only P1 correct
    } else if (p2Correct) {
        roundWinner = match.p2; // Only P2 correct
    }
    
    // Update scores
    if (roundWinner) {
        match.scores[roundWinner]++;
    }

    // Prepare time data for display
    const p1AnswerTime = ansP1 ? ansP1.time : null;
    const p2AnswerTime = ansP2 ? ansP2.time : null;

    // Broadcast results
    const results = {
        p1Score: match.scores[match.p1],
        p2Score: match.scores[match.p2],
        winnerId: roundWinner,
        correctAnswer: q.correctAnswer,
        timeP1: p1AnswerTime,
        timeP2: p2AnswerTime,
        roundStartTime: match.roundStartTime
    };
    io.to(match.p1).emit('round_results', results);
    io.to(match.p2).emit('round_results', results);
    
    // --- CHECK FOR TIEBREAKER END (Round 4 or higher) ---
    if (match.currentRound >= 4) {
        if (roundWinner) {
            // Tiebreaker won (Sudden Death)
            endGame(matchId);
            return; 
        } else {
            // No point scored, continue to the next tiebreaker round
            console.log('Tiebreaker round draw. Starting next sudden death round.');
            setTimeout(() => startGameRound(matchId, match.currentRound + 1), 3000);
            return; 
        }
    }

    const scoreP1 = match.scores[match.p1];
    const scoreP2 = match.scores[match.p2];
    const scoreDiff = Math.abs(scoreP1 - scoreP2);
    
    // Check 1: Early Termination (after Round 2)
    if (match.currentRound === 2 && scoreDiff >= 2) {
        // Game Over - Mercy Rule (e.g., 2-0 score)
        endGame(matchId);
    } 
    // Check 2: End of the primary 3 rounds
    else if (match.currentRound === 3) {
        if (scoreP1 === scoreP2) {
            // It's a draw, start the tiebreaker (Round 4)
            console.log(`Match ${matchId} tied at ${scoreP1}-${scoreP2}. Starting Tiebreaker.`);
            setTimeout(() => startGameRound(matchId, match.currentRound + 1), 3000);
        } else {
            // Game Over - A winner was decided (e.g., 2-1 or 3-0)
            endGame(matchId);
        }
    } 
    // Check 3: Standard progression 
    else {
        // Start next round after a short delay for results screen
        setTimeout(() => startGameRound(matchId, match.currentRound + 1), 3000);
    }
}

function endGame(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    const scoreP1 = match.scores[match.p1];
    const scoreP2 = match.scores[match.p2];
    let finalResult = 'Draw';
    let winnerId = null;

    if (scoreP1 > scoreP2) {
        finalResult = 'Player 1 Wins';
        winnerId = match.p1;
    } else if (scoreP2 > scoreP1) {
        finalResult = 'Player 2 Wins';
        winnerId = match.p2;
    }

    const finalData = {
        p1Score: scoreP1,
        p2Score: scoreP2,
        result: finalResult,
        winner: winnerId
    };
    
    io.to(match.p1).emit('game_over', finalData);
    io.to(match.p2).emit('game_over', finalData);
    
    delete activeMatches[matchId];
}


// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
