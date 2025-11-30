// --- 1. SETUP & CONFIGURATION ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// --- NEW IMPORT: Load the Master Confusion Map from the 'groups.js' file ---
const CONFUSION_GROUPS_MAP = require('./groups.js'); 
// -------------------------------------------------------------------------

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


// --- NEW CORE LOGIC FOR HIGH-DIFFICULTY DISTRACTOR SELECTION ---

/**
 * Selects 'count' unique random items from an array, excluding items in the 'exclude' list.
 * @param {Array<string>} sourceArr - Array of country names to select from.
 * @param {number} count - Number of items to select.
 * @param {Array<string>} excludeArr - Items to exclude from the selection.
 * @returns {Array<string>} Array of selected unique items.
 */
function selectUniqueRandom(sourceArr, count, excludeArr = []) {
    // Filter the source array to remove excluded items
    const selectionPool = sourceArr.filter(item => !excludeArr.includes(item));
    const selected = [];
    
    // Safety check to ensure we don't try to select more than available
    const maxSelect = Math.min(count, selectionPool.length); 

    while (selected.length < maxSelect) {
        const randomIndex = Math.floor(Math.random() * selectionPool.length);
        const item = selectionPool.splice(randomIndex, 1)[0]; // Remove item to ensure uniqueness
        selected.push(item);
    }
    return selected;
}

/**
 * Generates quiz options (4 total) based on the custom Confusion Groups Map.
 * This replaces the old simple random selection.
 * @param {string} correctCountry - The name of the flag currently being displayed.
 * @returns {Array<string>} An array of four shuffled country names (options).
 */
function generateQuizOptions(correctCountry) {
    // Get a flat list of all country names from the dataset
    const ALL_COUNTRIES_NAMES = flagData.map(flag => flag.country);
    let distractors = [];
    let groupCountries = null;
    const requiredDistractors = 3; 

    // 1. Find the Group for the correct country
    for (const key in CONFUSION_GROUPS_MAP) {
        if (CONFUSION_GROUPS_MAP[key].includes(correctCountry)) {
            groupCountries = CONFUSION_GROUPS_MAP[key];
            break;
        }
    }
    
    // 2. Select Primary Distractors (High Difficulty)
    if (groupCountries) {
        // Pool of distractors from the specific group, excluding the correct country
        const groupPool = groupCountries.filter(name => name !== correctCountry);

        // Select the maximum possible number of similar flags (up to 3) from the group
        const similarFlags = selectUniqueRandom(groupPool, requiredDistractors);
        distractors.push(...similarFlags);
    }
    
    // 3. Select Random Outliers (Fills remaining slots or handles SOLO_FALLBACK)
    
    // Calculate how many more options are needed to reach 3 total distractors
    const remainingSlots = requiredDistractors - distractors.length; 

    if (remainingSlots > 0) {
        // Collect all names already chosen (distractors + correct answer)
        const chosenNames = [correctCountry, ...distractors];

        // Select the remaining needed options from the entire country list
        const randomOutliers = selectUniqueRandom(ALL_COUNTRIES_NAMES, remainingSlots, chosenNames);
        distractors.push(...randomOutliers);
    }
    
    // 4. Assemble and Shuffle Final Options
    const finalOptions = [correctCountry, ...distractors];
    
    // Safety check: ensure 4 options are generated. If not, use emergency random fallback.
    if (finalOptions.length !== 4) {
        console.error(`Error generating options for ${correctCountry}. Generated ${finalOptions.length} options. Using random fallback.`);
        const backupDistractors = selectUniqueRandom(ALL_COUNTRIES_NAMES, 3, [correctCountry]);
        return shuffleArray([correctCountry, ...backupDistractors]);
    }
    
    return shuffleArray(finalOptions);
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
        roundStartTime: 0 
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
    
    // Record the Server's Round Start Time
    match.roundStartTime = Date.now(); 

    // Get the current question (flag)
    const questionIndex = roundNumber - 1;
    const currentQuestion = match.matchQuestions[questionIndex];
    
    if (!currentQuestion) {
        // Handle case where we run out of questions (draw or final winner)
        return calculateScores(matchId, true); 
    }

    const { country, image } = currentQuestion;

    // --- CRITICAL UPDATE: CALL NEW LOGIC ---
    const options = generateQuizOptions(country);
    // ------------------------------------

    // Send question data to both clients
    io.to(matchId).emit('new_round', {
        round: roundNumber,
        image: image,
        options: options // Now contains 4 well-chosen, high-difficulty options
    });

    console.log(`Match ${matchId}: Starting Round ${roundNumber}. Correct answer: ${country}`);
}

/**
 * Calculates scores and determines the next action (next round or game over).
 */
function calculateScores(matchId, isFinalCheck = false) {
    const match = activeMatches[matchId];
    if (!match) return;

    const { p1Id, p2Id, roundAnswers, matchQuestions, currentRound, roundStartTime } = match;
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

        // Calculate elapsed time using server's roundStartTime
        const p1TimeElapsed = p1Answer ? (p1Answer.time - roundStartTime) / 1000 : Infinity; 
        const p2TimeElapsed = p2Answer ? (p2Answer.time - roundStartTime) / 1000 : Infinity;
        
        // --- Broadcast Round Results ---
        io.to(matchId).emit('round_results', {
            correctAnswer: correctAnswer,
            p1Score: match.p1Score,
            p2Score: match.p2Score,
            // Send the calculated elapsed time
            p1Time: p1TimeElapsed, 
            p2Time: p2TimeElapsed,
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

        const receiveTime = Date.now(); 
        const answerData = {
            answer: data.answer,
            time: receiveTime 
        };

        const isP1 = socket.id === match.p1Id;
        const timeElapsed = (receiveTime - match.roundStartTime) / 1000;
        
        // Identify the Opponent ID
        const opponentId = isP1 ? match.p2Id : match.p1Id;
        
        // Track whether the answer was successfully recorded this time
        let answerRecorded = false;

        if (isP1 && !match.roundAnswers.p1) {
            match.roundAnswers.p1 = answerData;
            answerRecorded = true;
        } else if (!isP1 && !match.roundAnswers.p2) {
            match.roundAnswers.p2 = answerData;
            answerRecorded = true;
        }

        // Only emit feedback if the answer was recorded for the first time
        if (answerRecorded) {
            
            // 1. Emit to the current player (Self)
            socket.emit('answer_registered', {
                timeElapsed: timeElapsed,
                isOpponent: false // This tells the client to update the 'YOU' time
            });
            
            // 2. Emit to the opponent
            io.to(opponentId).emit('answer_registered', {
                timeElapsed: timeElapsed,
                isOpponent: true // This tells the client to update the 'OPPONENT' time
            });
        }
        
        // Check if both players have submitted to end the round
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
// Note: In a production app, this should be moved to a separate JSON file (flag_data.json)
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
