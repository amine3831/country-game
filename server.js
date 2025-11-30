// --- 1. SETUP & CONFIGURATION ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Initialize Socket.IO with the HTTP server
const io = new Server(server);

const PORT = 3000;
const TOTAL_ROUNDS = 3; // Number of guaranteed rounds before sudden death

// Game state variables
let waitingPlayer = null; // Stores the socket of a player waiting for a match
const activeMatches = {};  // Stores active match objects, keyed by matchId

// Serve the static index.html file
app.get('/', (req, res) => {
    // Note: Ensure your 'index.html' is in the same directory as server.js
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 2. UTILITY FUNCTIONS ---

/**
 * Shuffles an array in place (Fisher-Yates algorithm).
 * @param {Array} array - The array to shuffle.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Creates a unique match ID.
 * @returns {string} A unique 6-character ID.
 */
function generateMatchId() {
    return Math.random().toString(36).substring(2, 8);
}

/**
 * Gets N random distractor countries that are NOT the correct country.
 * @param {string} correctCountryName - The country name to exclude.
 * @param {number} count - The number of distractor countries to return.
 * @returns {Array<string>} An array of country names.
 */
function getDistractorCountries(correctCountryName, count) {
    // Filter out the correct country
    const potentialDistractors = flagData
        .filter(flag => flag.country !== correctCountryName)
        .map(flag => flag.country);

    // Shuffle and slice the required number of distractors
    shuffleArray(potentialDistractors);
    return potentialDistractors.slice(0, count);
}


// --- 3. MATCH & GAME MANAGEMENT ---

/**
 * Initializes a new match and its state.
 */
function createNewMatch(p1Id, p2Id, matchId) {
    // Get a shuffled list of ALL questions to ensure no repeats in a match
    const shuffledQuestions = shuffleArray([...flagData]); 

    activeMatches[matchId] = {
        id: matchId,
        p1Id: p1Id, // The player who connected first
        p2Id: p2Id, // The player who connected second
        p1Score: 0,
        p2Score: 0,
        currentRound: 0,
        matchQuestions: shuffledQuestions, // All flags for the match
        roundAnswers: { p1: null, p2: null }, // Temp storage for current round answers
        // Store match start time for accurate time calculation relative to round start
        // Although this is used for final time calculation, roundStartTime in client is better for user perception.
        startTime: Date.now() 
    };

    io.to(p1Id).emit('match_found', { matchId, isP1: true });
    io.to(p2Id).emit('match_found', { matchId, isP1: false });
    
    console.log(`Match ${matchId} created between ${p1Id} and ${p2Id}.`);
    
    // Start the game immediately
    startGameRound(matchId, 1);
}

/**
 * Starts a new quiz round.
 */
function startGameRound(matchId, roundNumber) {
    const match = activeMatches[matchId];
    if (!match) return;

    // Reset round state
    match.currentRound = roundNumber;
    match.roundAnswers = { p1: null, p2: null }; 

    // Get the current question (flag)
    const questionIndex = roundNumber - 1;
    const currentQuestion = match.matchQuestions[questionIndex];
    
    if (!currentQuestion) {
        // Handle case where we run out of questions (draw or final winner)
        return calculateScores(matchId, true); 
    }

    const { country, image } = currentQuestion;

    // Generate 3 random incorrect options
    const distractors = getDistractorCountries(country, 3);
    
    // Combine correct and incorrect, then shuffle the options
    const options = shuffleArray([country, ...distractors]);

    // Send question data to both clients
    io.to(matchId).emit('new_round', {
        round: roundNumber,
        image: image,
        options: options
    });

    console.log(`Match ${matchId}: Starting Round ${roundNumber}. Correct answer: ${country}`);
}

/**
 * Calculates scores and determines the next action (next round or game over).
 * @param {string} matchId - The ID of the match.
 * @param {boolean} isFinalCheck - If true, it forces a score check (e.g., when questions run out).
 */
function calculateScores(matchId, isFinalCheck = false) {
    const match = activeMatches[matchId];
    if (!match) return;

    const { p1Id, p2Id, roundAnswers, matchQuestions, currentRound } = match;
    const currentQuestion = matchQuestions[currentRound - 1];
    const correctAnswer = currentQuestion.country;

    const p1Answer = roundAnswers.p1;
    const p2Answer = roundAnswers.p2;
    
    // Check if both players have answered (or if it's the final check)
    if ((p1Answer && p2Answer) || isFinalCheck) {
        
        let winnerId = null;
        let p1Correct = p1Answer && p1Answer.answer === correctAnswer;
        let p2Correct = p2Answer && p2Answer.answer === correctAnswer;

        if (p1Correct && p2Correct) {
            // Both correct: Winner is the fastest (lower timestamp)
            if (p1Answer.time < p2Answer.time) {
                match.p1Score++;
                winnerId = p1Id;
            } else if (p2Answer.time < p1Answer.time) {
                match.p2Score++;
                winnerId = p2Id;
            }
        } else if (p1Correct) {
            // P1 correct, P2 incorrect/missed
            match.p1Score++;
            winnerId = p1Id;
        } else if (p2Correct) {
            // P2 correct, P1 incorrect/missed
            match.p2Score++;
            winnerId = p2Id;
        }

        // --- Broadcast Round Results ---
        io.to(matchId).emit('round_results', {
            correctAnswer: correctAnswer,
            p1Score: match.p1Score,
            p2Score: match.p2Score,
            // These times are currently raw server receive times.
            // The client will calculate the difference from their round start time.
            p1Time: p1Answer ? p1Answer.time : Infinity, 
            p2Time: p2Answer ? p2Answer.time : Infinity,
            winnerId: winnerId
        });
        
        console.log(`Match ${matchId} Round ${currentRound} result: P1(${match.p1Score}) vs P2(${match.p2Score}). Winner: ${winnerId ? winnerId : 'None'}`);

        // --- Determine Next Game State ---
        
        let nextRound = currentRound + 1;
        
        // 1. Check for SUDDEN DEATH WIN after round 3
        if (currentRound >= TOTAL_ROUNDS) {
            if (match.p1Score !== match.p2Score) {
                // Scores are unequal after initial rounds or in tiebreaker
                return endGame(matchId);
            }
            // If scores are equal, continue to next sudden death tiebreaker round
        }

        // 2. Check if we've run out of questions
        if (nextRound > matchQuestions.length) {
            return endGame(matchId);
        }

        // 3. Continue to the next round after a 3-second delay
        setTimeout(() => {
            startGameRound(matchId, nextRound);
        }, 3000); 

    }
}

/**
 * Ends the match and broadcasts the final result.
 */
function endGame(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    let winnerId = null;
    if (match.p1Score > match.p2Score) {
        winnerId = match.p1Id;
    } else if (match.p2Score > match.p1Score) {
        winnerId = match.p2Id;
    }

    io.to(matchId).emit('game_over', {
        winner: winnerId,
        p1Score: match.p1Score,
        p2Score: match.p2Score
    });
    
    console.log(`Match ${matchId} ended. Winner: ${winnerId || 'Draw'}`);

    // Clean up
    io.sockets.sockets.get(match.p1Id)?.leave(matchId);
    io.sockets.sockets.get(match.p2Id)?.leave(matchId);
    delete activeMatches[matchId];
}

// --- 4. SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    
    // --- Matchmaking Logic ---
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
        const matchId = generateMatchId();
        
        // Both players join the unique match room
        waitingPlayer.join(matchId);
        socket.join(matchId);

        createNewMatch(waitingPlayer.id, socket.id, matchId);
        waitingPlayer = null; // Clear the waiting player
        
    } else {
        waitingPlayer = socket;
        socket.emit('waiting_for_opponent');
    }

    // --- Player Answer Submission ---
    socket.on('submit_answer', (data) => {
        const match = activeMatches[data.matchId];
        if (!match) return;

        // **CRITICAL FIX: Record the time the server RECEIVED the answer**
        const receiveTime = Date.now(); 
        
        const answerData = {
            answer: data.answer,
            time: receiveTime // Use the reliable server-side timestamp
        };

        const isP1 = socket.id === match.p1Id;

        // Store the answer based on which player submitted it
        if (isP1 && !match.roundAnswers.p1) {
            match.roundAnswers.p1 = answerData;
            
            // **NEW LOGIC: Emit immediate feedback to the submitting player**
            socket.emit('answer_registered', {
                serverReceiveTime: receiveTime
            });

        } else if (!isP1 && !match.roundAnswers.p2) {
            match.roundAnswers.p2 = answerData;
            
            // **NEW LOGIC: Emit immediate feedback to the submitting player**
            socket.emit('answer_registered', {
                serverReceiveTime: receiveTime
            });
        }
        
        // Check if both players have submitted
        if (match.roundAnswers.p1 && match.roundAnswers.p2) {
            calculateScores(data.matchId);
        }
    });

    // --- Disconnect Handling ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null; // Remove from waiting list
        } else {
            // Find which match the disconnected player was in
            for (const matchId in activeMatches) {
                const match = activeMatches[matchId];
                if (match.p1Id === socket.id || match.p2Id === socket.id) {
                    
                    const opponentId = (match.p1Id === socket.id) ? match.p2Id : match.p1Id;
                    
                    // Notify the remaining player
                    io.to(opponentId).emit('opponent_disconnected', 'Your opponent disconnected! The game has ended.');
                    
                    // Clean up the match
                    delete activeMatches[matchId];
                    break;
                }
            }
        }
    });
});

// --- 5. START SERVER ---
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});


// --- 6. FLAG DATASET (50 Flags) ---
const flagData = [
    { country: "Albania", image: "https://flagcdn.com/al.svg" },
    { country: "Algeria", image: "https://flagcdn.com/dz.svg" },
    { country: "Argentina", image: "https://flagcdn.com/ar.svg" },
    { country: "Australia", image: "https://flagcdn.com/au.svg" },
    { country: "Austria", image: "https://flagcdn.com/at.svg" },
    { country: "Bangladesh", image: "https://flagcdn.com/bd.svg" },
    { country: "Belgium", image: "https://flagcdn.com/be.svg" },
    { country: "Brazil", image: "https://flagcdn.com/br.svg" },
    { country: "Canada", image: "https://flagcdn.com/ca.svg" },
    { country: "Chile", image: "https://flagcdn.com/cl.svg" },
    { country: "China", image: "https://flagcdn.com/cn.svg" },
    { country: "Colombia", image: "https://flagcdn.com/co.svg" },
    { country: "Cuba", image: "https://flagcdn.com/cu.svg" },
    { country: "Denmark", image: "https://flagcdn.com/dk.svg" },
    { country: "Egypt", image: "https://flagcdn.com/eg.svg" },
    { country: "Finland", image: "https://flagcdn.com/fi.svg" },
    { country: "France", image: "https://flagcdn.com/fr.svg" },
    { country: "Germany", image: "https://flagcdn.com/de.svg" },
    { country: "Greece", image: "https://flagcdn.com/gr.svg" },
    { country: "India", image: "https://flagcdn.com/in.svg" },
    { country: "Indonesia", image: "https://flagcdn.com/id.svg" },
    { country: "Ireland", image: "https://flagcdn.com/ie.svg" },
    { country: "Israel", image: "https://flagcdn.com/il.svg" },
    { country: "Italy", image: "https://flagcdn.com/it.svg" },
    { country: "Japan", image: "https://flagcdn.com/jp.svg" },
    { country: "Mexico", image: "https://flagcdn.com/mx.svg" },
    { country: "Morocco", image: "https://flagcdn.com/ma.svg" },
    { country: "Netherlands", image: "https://flagcdn.com/nl.svg" },
    { country: "New Zealand", image: "https://flagcdn.com/nz.svg" },
    { country: "Norway", image: "https://flagcdn.com/no.svg" },
    { country: "Pakistan", image: "https://flagcdn.com/pk.svg" },
    { country: "Peru", image: "https://flagcdn.com/pe.svg" },
    { country: "Philippines", image: "https://flagcdn.com/ph.svg" },
    { country: "Poland", image: "https://flagcdn.com/pl.svg" },
    { country: "Portugal", image: "https://flagcdn.com/pt.svg" },
    { country: "Romania", image: "https://flagcdn.com/ro.svg" },
    { country: "Russia", image: "https://flagcdn.com/ru.svg" },
    { country: "Saudi Arabia", image: "https://flagcdn.com/sa.svg" },
    { country: "South Africa", image: "https://flagcdn.com/za.svg" },
    { country: "South Korea", image: "https://flagcdn.com/kr.svg" },
    { country: "Spain", image: "https://flagcdn.com/es.svg" },
    { country: "Sweden", image: "https://flagcdn.com/se.svg" },
    { country: "Switzerland", image: "https://flagcdn.com/ch.svg" },
    { country: "Thailand", image: "https://flagcdn.com/th.svg" },
    { country: "Turkey", image: "https://flagcdn.com/tr.svg" },
    { country: "Ukraine", image: "https://flagcdn.com/ua.svg" },
    { country: "United Kingdom", image: "https://flagcdn.com/gb.svg" },
    { country: "United States", image: "https://flagcdn.com/us.svg" },
    { country: "Vietnam", image: "https://flagcdn.com/vn.svg" },
    { country: "Zimbabwe", image: "https://flagcdn.com/zw.svg" }
];
