// Server Dependencies
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const flagData = require('./flag_data.json'); // Your question bank

const PORT = process.env.PORT || 3000;

// --- GLOBAL GAME DATA SETUP ---
// Get a global array of all country names for dynamic option generation
const allCountryNames = flagData.map(q => q.correctAnswer); 
// We select enough questions for all potential tiebreakers
const MAX_MATCH_ROUNDS = flagData.length; 
const INITIAL_ROUNDS = 3; // The base number of rounds before tie-break logic kicks in

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
        const matchId = socket.id + waitingPlayer.id;
        // Generate and store the unique random questions for this match
        activeMatches[matchId] = createNewMatch(waitingPlayer.id, socket.id, matchId);
        
        io.to(waitingPlayer.id).emit('match_found', { opponentId: socket.id, matchId: matchId, isP1: true });
        socket.emit('match_found', { opponentId: waitingPlayer.id, matchId: matchId, isP1: false });
        
        startGameRound(matchId, 1);
        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
        socket.emit('waiting_for_opponent');
    }

    // --- 2. RECEIVE ANSWER ---
    socket.on('submit_answer', (data) => {
        const match = activeMatches[data.matchId];
        if (!match) return; 

        const playerKey = socket.id;
        
        if (!match.roundAnswers[playerKey]) {
            match.roundAnswers[playerKey] = {
                answer: data.answer,
                time: Date.now() 
            };
            
            if (match.roundAnswers[match.p1] && match.roundAnswers[match.p2]) {
                calculateScores(match.matchId);
            }
        }
    });

    // --- 3. DISCONNECT ---
    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        
        for (const id in activeMatches) {
            const match = activeMatches[id];
            if (match.p1 === socket.id || match.p2 === socket.id) {
                const opponentId = match.p1 === socket.id ? match.p2 : match.p1;
                io.to(opponentId).emit('opponent_disconnected', 'Your opponent disconnected. You win!');
                delete activeMatches[id];
                break;
            }
        }
        console.log(`Player disconnected: ${socket.id}`);
    });
});


// --- GAME HELPER FUNCTIONS ---

/**
 * Generates a full list of questions for the match by shuffling the flag data.
 * @returns {Array} An array of shuffled flag objects.
 */
function generateRandomMatchQuestions() {
    let shuffledData = [...flagData]; 
    shuffleArray(shuffledData);
    
    // Select enough questions for all potential tiebreakers
    return shuffledData.slice(0, MAX_MATCH_ROUNDS); 
}


function createNewMatch(p1Id, p2Id, matchId) {
    return {
        matchId,
        p1: p1Id,
        p2: p2Id,
        currentRound: 0,
        scores: { [p1Id]: 0, [p2Id]: 0 },
        matchQuestions: generateRandomMatchQuestions(), 
        currentQuestion: null,
        roundAnswers: { [p1Id]: null, [p2Id]: null }
    };
}

function startGameRound(matchId, roundNumber) {
    const match = activeMatches[matchId];
    // Check if we ran out of questions
    if (!match || roundNumber > match.matchQuestions.length) return endGame(matchId, 'Draw (Questions Exhausted)'); 

    match.currentRound = roundNumber;
    
    // Select the question from the pre-shuffled list for this match.
    const question = match.matchQuestions[roundNumber - 1]; 
    if (!question) return endGame(matchId, 'Question not found for this round.');

    // 1. Get the correct answer
    const correctAnswer = question.correctAnswer;
    
    // 2. Select three random, unique distractors
    let options = [correctAnswer];
    // Filter out the current correct answer
    let distractors = allCountryNames.filter(name => name !== correctAnswer);

    // Shuffle distractors list (Ensures different wrong answers each time)
    shuffleArray(distractors); 

    // Add the first three shuffled distractors
    options.push(...distractors.slice(0, 3));
    
    // 3. Shuffle the final options so the correct answer is not always in the same position
    shuffleArray(options); 
    
    match.currentQuestion = question;
    match.roundAnswers = { [match.p1]: null, [match.p2]: null }; 
    match.roundStartTimestamp = Date.now(); // Record the start time

    // Broadcast the new question data
    const questionData = {
        // questionId: question.id, // Removed question.id as it may not exist in flag_data.json
        image: question.image,
        options: options, // Send the dynamically generated options
        round: roundNumber
    };
    io.to(match.p1).emit('new_round', questionData);
    io.to(match.p2).emit('new_round', questionData);
}

function calculateScores(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    const q = match.currentQuestion;
    const ansP1 = match.roundAnswers[match.p1];
    const ansP2 = match.roundAnswers[match.p2];
    
    // Get answers and times (default to null/Infinity if player didn't answer)
    const p1Ans = ansP1 ? ansP1.answer : null;
    const p2Ans = ansP2 ? ansP2.answer : null;
    const p1Time = ansP1 ? ansP1.time : Infinity;
    const p2Time = ansP2 ? ansP2.time : Infinity;
    
    let roundWinner = null;
    let p1Correct = (p1Ans === q.correctAnswer);
    let p2Correct = (p2Ans === q.correctAnswer);
    
    // --- 1. SINGLE POINT PER ROUND LOGIC ---
    if (p1Correct && p2Correct) {
        // Tie-break on speed
        roundWinner = (p1Time < p2Time) ? match.p1 : match.p2;
    } else if (p1Correct) {
        roundWinner = match.p1; 
    } else if (p2Correct) {
        roundWinner = match.p2; 
    }
    
    if (roundWinner) {
        match.scores[roundWinner]++;
    }

    // Calculate final time duration for display (in seconds)
    const p1FinalTime = p1Time === Infinity ? Infinity : (p1Time - match.roundStartTimestamp) / 1000;
    const p2FinalTime = p2Time === Infinity ? Infinity : (p2Time - match.roundStartTimestamp) / 1000;

    // Broadcast results
    const results = {
        p1Score: match.scores[match.p1],
        p2Score: match.scores[match.p2],
        winnerId: roundWinner,
        correctAnswer: q.correctAnswer,
        p1Time: p1FinalTime, 
        p2Time: p2FinalTime  
    };
    io.to(match.p1).emit('round_results', results);
    io.to(match.p2).emit('round_results', results);
    
    
    // --- 2. TIEBREAKER / GAME PROGRESSION LOGIC ---
    const scoreP1 = match.scores[match.p1];
    const scoreP2 = match.scores[match.p2];

    const nextRound = match.currentRound + 1;
    
    if (match.currentRound < INITIAL_ROUNDS) {
        // Standard rounds: continue to the next round if possible
        setTimeout(() => startGameRound(matchId, nextRound), 3000);
        
    } else if (scoreP1 !== scoreP2) {
        // TIEBREAKER MODE (Round 4+): If the scores are NOT equal, a winner is found!
        endGame(matchId);
        
    } else if (nextRound <= match.matchQuestions.length) {
        // TIEBREAKER MODE (Round 4+): Scores are STILL equal, start the next sudden death round
        setTimeout(() => startGameRound(matchId, nextRound), 3000);
        
    } else {
        // We ran out of questions!
        endGame(matchId, 'Draw (Questions Exhausted)'); 
    }
}

function endGame(matchId, reason = null) {
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
    } else if (reason && reason.includes('Exhausted')) {
         // If exhausted, the game remains a draw unless a winner was found previously
         finalResult = 'Draw';
         winnerId = null;
    }


    const finalData = {
        p1Score: scoreP1,
        p2Score: scoreP2,
        result: finalResult,
        winner: winnerId,
        reason: reason
    };
    
    io.to(match.p1).emit('game_over', finalData);
    io.to(match.p2).emit('game_over', finalData);
    
    delete activeMatches[matchId];
}

// Global utility to shuffle arrays (Fisher-Yates Shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
