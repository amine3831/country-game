// server.js (COMPLETE CODE)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io'); 

const app = express();
const server = http.createServer(app);
const io = socketio(server);


// --- 2. IN-MEMORY TESTING DATABASE & GAME DATA ---
// Users will be added here dynamically via the /signup route. (Lost on server restart)
let users = []; 
console.log(`✅ In-Memory Test Database initialized with ${users.length} users (empty).`);

let flagData = []; 
let CONFUSION_GROUPS_MAP = {}; 

try {
    const rawFlagData = require('./flag_data.json'); 
    flagData = rawFlagData.map(item => ({
        ...item,
        country: item.correctAnswer, 
        image: item.image, 
    }));
    
    CONFUSION_GROUPS_MAP = require('./groups');
    // Ensure the confusion map is extracted correctly if wrapped in an object
    if (typeof CONFUSION_GROUPS_MAP === 'object' && CONFUSION_GROUPS_MAP !== null && !Array.isArray(CONFUSION_GROUPS_MAP)) {
        CONFUSION_GROUPS_MAP = CONFUSION_GROUPS_MAP.CONFUSION_GROUPS_MAP || CONFUSION_GROUPS_MAP.groups || CONFUSION_GROUPS_MAP;
    }

    console.log(`✅ Flag data loaded: ${flagData.length} flags.`);
} catch (error) {
    console.error("❌ CRITICAL ERROR: Failed to load game data or groups map. Game will not function:", error.message);
}


// --- 3. GLOBAL STATE & CONFIGURATION ---

let waitingPlayer = null; 
const activeMatches = {};  
const simpleGames = {}; 
const MAX_ROUNDS = 10;
const ROUND_TIME_LIMIT_MS = 10000;

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 

// --- 4. UTILITY FUNCTIONS ---

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateMatchId() {
    return Math.random().toString(36).substring(2, 8);
}

function selectUniqueRandom(sourceArr, count, excludeArr = []) {
    if (!sourceArr || sourceArr.length === 0) return []; 
    const selectionPool = sourceArr.filter(item => !excludeArr.includes(item));
    return shuffleArray(selectionPool).slice(0, count);
}

function generateQuizOptions(correctCountry) {
    const ALL_COUNTRIES_NAMES = flagData.map(flag => flag.country);
    let distractors = [];
    let groupCountries = null;
    const requiredDistractors = 3; 

    for (const key in CONFUSION_GROUPS_MAP) {
        if (CONFUSION_GROUPS_MAP[key].includes(correctCountry)) {
            groupCountries = CONFUSION_GROUPS_MAP[key];
            break; 
        }
    }
    
    if (groupCountries) {
        const groupPool = groupCountries.filter(name => name !== correctCountry);
        const similarFlags = selectUniqueRandom(groupPool, requiredDistractors);
        distractors.push(...similarFlags);
    }
    
    const remainingSlots = requiredDistractors - distractors.length; 

    if (remainingSlots > 0) {
        const chosenNames = [correctCountry, ...distractors];
        const randomOutliers = selectUniqueRandom(ALL_COUNTRIES_NAMES, remainingSlots, chosenNames);
        distractors.push(...randomOutliers);
    }
    
    const finalOptions = [correctCountry, ...distractors];
    
    if (finalOptions.length !== 4) {
        console.error(`Error generating options for ${correctCountry}. Using random fallback.`);
        const backupDistractors = selectUniqueRandom(ALL_COUNTRIES_NAMES, 3, [correctCountry]);
        return shuffleArray([correctCountry, ...backupDistractors]);
    }
    
    return shuffleArray(finalOptions);
}

function startSimpleGameRound(playerId) {
    const game = simpleGames[playerId];
    if (!game) {
        console.error(`ERROR: Game object not found for playerId: ${playerId}`);
        return;
    }
    
    if (game.matchQuestions.length === 0) {
         console.error("DATA ERROR: matchQuestions is empty! Cannot start round.");
         return;
    }

    game.currentQuestionIndex++;
    
    const questionIndex = game.currentQuestionIndex % game.matchQuestions.length; 
    const currentQuestion = game.matchQuestions[questionIndex];
    
    if (!currentQuestion || typeof currentQuestion.country !== 'string' || currentQuestion.country.length === 0) {
        console.error("DATA ERROR: Current question object is invalid or country name is missing.");
        return;
    }
    
    console.log(`[SIMPLE] Starting Round ${game.currentStreak + 1}. Flag: ${currentQuestion.country}`);
    
    const options = generateQuizOptions(currentQuestion.country);

    io.to(playerId).emit('simple_new_round', {
        streak: game.currentStreak,
        highScore: game.highScore, 
        image: currentQuestion.image,
        options: options
    });
}

/** Starts the current round for a multiplayer match and sets a timer. */
function startMultiplayerRound(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    // Check for end of match
    if (match.questionIndex >= MAX_ROUNDS - 1) {
        endMatch(matchId);
        return;
    }

    match.questionIndex++;
    match.currentFlag = match.questions[match.questionIndex];

    // Reset answered status and calculate options
    Object.values(match.players).forEach(p => {
        p.answeredThisRound = false;
    });

    const options = generateQuizOptions(match.currentFlag.country);

    console.log(`[MATCH ${matchId}] Starting Round ${match.questionIndex + 1}. Flag: ${match.currentFlag.country}`);

    // Broadcast the new round data to the match room
    io.to(matchId).emit('multiplayer_new_round', {
        roundNumber: match.questionIndex + 1,
        maxRounds: MAX_ROUNDS,
        image: match.currentFlag.image,
        options: options,
        scores: Object.values(match.players).reduce((acc, p) => {
            acc[p.username] = p.score;
            return acc;
        }, {})
    });

    // Set a timer for the round
    match.roundTimer = setTimeout(() => {
        startNextMultiplayerRound(matchId);
    }, ROUND_TIME_LIMIT_MS);
}

/** Handles round progression, checking if the match is over. */
function startNextMultiplayerRound(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;
    
    // Check if the match is truly over
    if (match.questionIndex >= MAX_ROUNDS - 1) {
        endMatch(matchId);
    } else {
        // Proceed to the next round
        startMultiplayerRound(matchId);
    }
}

/** Finalizes the match, determines the winner, and cleans up state. */
function endMatch(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    // Determine Winner
    const playerScores = Object.values(match.players).map(p => ({ username: p.username, score: p.score }));
    playerScores.sort((a, b) => b.score - a.score);

    const winner = playerScores[0].score > playerScores[1].score ? playerScores[0].username : 
                   playerScores[0].score < playerScores[1].score ? playerScores[1].username : 'Tie';
    
    console.log(`[MATCH ${matchId}] Match Ended. Winner: ${winner}. Scores: ${playerScores[0].username} (${playerScores[0].score}) vs ${playerScores[1].username} (${playerScores[1].score})`);

    // Notify all players in the room
    io.to(matchId).emit('match_game_over', {
        scores: playerScores,
        winner: winner,
    });
    
    // Clean up
    delete activeMatches[matchId];
}


// --- 5. EXPRESS ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/simple_game', (req, res) => {
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});


// SIGN-UP LOGIC
app.post('/signup', (req, res) => {
    const { name, username, email, password } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).send("Registration failed: Missing required fields.");
    }

    if (users.find(u => u.username === username)) {
        return res.status(409).send("Registration failed: Username already exists.");
    }
    
    try {
        const newUser = {
            id: 'user_' + Math.random().toString(36).substring(2, 10),
            username: username,
            email: email,
            password: password, 
            name: name,
            highScore: 0,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        
        console.log(`✅ New user signed up: ${username}. Total users: ${users.length}`);
        
        // Redirect back to login with a success status
        res.redirect('/login?status=success&username=' + username);
        
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("Registration failed due to a server error.");
    }
});


// LOGIN ROUTE
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
        console.log(`[LOGIN FAILED] User not found: ${username}`);
        return res.status(401).send("Login failed: Invalid username or password.");
    }

    // Trim both passwords to eliminate possible invisible spaces (stability fix)
    if (password.trim() === user.password.trim()) { 
        const userId = user.id;
        
        console.log(`✅ User logged in: ${username}`);
        
        res.redirect(`/?userId=${userId}&username=${username}`); 
            
    } else {
        console.log(`[LOGIN FAILED] Password mismatch for ${username}.`);
        res.status(401).send("Login failed: Invalid username or password.");
    }
});


app.get('/logout', (req, res) => {
    res.redirect('/login');
});


// --- 6. SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    let username = socket.handshake.query.username || 'Guest'; 
    
    const user = users.find(u => u.id === userId);

    if (!user) {
        console.error("Authentication Failed: Invalid or missing userId. Disconnecting socket.");
        socket.emit('unauthorized_access');
        return socket.disconnect(true);
    }
    
    username = user.username;
    
    console.log(`[SOCKET] User connected: ${username} (ID: ${userId})`);
    
    socket.emit('auth_successful', { username: username });

    
    // --- SIMPLE GAME HANDLERS ---

    socket.on('start_simple_session', () => {
        
        if (!flagData || flagData.length === 0) {
            socket.emit('server_error', { message: "Game data is unavailable on the server." });
            return; 
        }

        if (simpleGames[socket.id]) {
            delete simpleGames[socket.id]; 
        }

        const shuffledQuestions = shuffleArray([...flagData]); 
        
        simpleGames[socket.id] = {
            id: generateMatchId(), 
            playerId: socket.id, 
            currentStreak: 0,
            highScore: user.highScore || 0, 
            matchQuestions: shuffledQuestions, 
            currentQuestionIndex: -1,
        };
        
        console.log(`[SIMPLE] Session started for ${socket.id}. Attempting first round...`);
        startSimpleGameRound(socket.id); 
    });


    socket.on('submit_simple_answer', (data) => {
        const game = simpleGames[socket.id];
        if (!game || game.currentQuestionIndex === -1) return;

        const questionIndex = game.currentQuestionIndex % game.matchQuestions.length;
        const question = game.matchQuestions[questionIndex];
        const isCorrect = data.answer === question.country;
        
        socket.emit('simple_game_feedback', {
            isCorrect: isCorrect,
            correctAnswer: question.country
        });

        if (isCorrect) {
            game.currentStreak++;
            startSimpleGameRound(socket.id);
            
        } else {
            const finalStreak = game.currentStreak;
            
            if (finalStreak > user.highScore) { 
                user.highScore = finalStreak; 
                game.highScore = finalStreak;
                console.log(`⭐ High score updated for ${user.username}: ${finalStreak}`);
            }
            
            socket.emit('simple_game_over', {
                finalStreak: finalStreak,
                highScore: user.highScore
            });
        }
    });

    
    // --- MULTIPLAYER HANDLERS (STABILIZED) ---

    socket.on('start_multiplayer', () => {
        if (!flagData || flagData.length === 0) {
            return socket.emit('server_error', { message: "Game data is unavailable on the server." });
        }
        
        console.log(`[MULTIPLAYER] ${username} (ID: ${socket.id}) is attempting to start a match.`);

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Player 2 found: Start the Match
            
            // Define Player 1 (the one waiting)
            const player1Id = waitingPlayer.id;
            const player1Username = waitingPlayer.username;
            const player1Socket = io.sockets.sockets.get(player1Id);
            
            // Define Player 2 (the one joining now)
            const player2Id = socket.id;
            const player2Username = username;
            const player2Socket = socket;
            
            if (!player1Socket) {
                // Critical safety check: If the waiting player disconnected right before this, reset.
                console.error(`ERROR: Waiting player socket (${player1Id}) not found. Resetting waiting list.`);
                waitingPlayer = { id: player2Id, username: player2Username };
                return socket.emit('searching');
            }

            const matchId = generateMatchId();
            const matchQuestions = shuffleArray([...flagData]).slice(0, MAX_ROUNDS); 

            const match = {
                id: matchId,
                players: {
                    [player1Id]: { username: player1Username, score: 0, socket: player1Socket },
                    [player2Id]: { username: player2Username, score: 0, socket: player2Socket },
                },
                questionIndex: -1,
                questions: matchQuestions,
                currentFlag: null,
                roundTimer: null,
            };
            
            activeMatches[matchId] = match;

            // Clear the waiting list
            waitingPlayer = null;

            // Group the two sockets into a single room for easy communication
            player1Socket.join(matchId);
            player2Socket.join(matchId);

            console.log(`✅ MATCH STARTED: ${player1Username} vs ${player2Username} (ID: ${matchId})`);
            
            // Notify both players the match has started
            io.to(matchId).emit('match_started', {
                matchId: matchId,
                opponent: player2Username, // The name of the opponent for Player 1
                playerMap: {
                    [player1Id]: player1Username,
                    [player2Id]: player2Username
                }
            });

            // Start the first round after a brief delay
            setTimeout(() => {
                startMultiplayerRound(matchId);
            }, 1000);

        } else {
            // Player 1: Register as waiting
            waitingPlayer = { id: socket.id, username: username };
            console.log(`[MULTIPLAYER] ${username} is now waiting for an opponent.`);
            socket.emit('searching');
        }
    });

    socket.on('submit_multiplayer_answer', (data) => {
        const { matchId, answer } = data;
        const match = activeMatches[matchId];

        if (!match || match.questionIndex === -1) return;
        
        const playerId = socket.id;
        
        if (match.players[playerId].answeredThisRound) return;

        const currentQuestion = match.questions[match.questionIndex];
        const isCorrect = answer === currentQuestion.country;
        
        match.players[playerId].answeredThisRound = true;

        if (isCorrect) {
            match.players[playerId].score += 1;
        }

        console.log(`[MATCH ${matchId}] ${match.players[playerId].username} answered. Correct: ${isCorrect}. Score: ${match.players[playerId].score}`);

        socket.emit('multiplayer_feedback', { isCorrect: isCorrect, correctAnswer: currentQuestion.country });

        const allAnswered = Object.values(match.players).every(p => p.answeredThisRound);

        if (allAnswered) {
            clearTimeout(match.roundTimer);
            startNextMultiplayerRound(matchId);
        }
    });


    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', () => { 
        delete simpleGames[socket.id];
        
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            console.log(`[MULTIPLAYER] Cleared waiting player: ${username}`);
            waitingPlayer = null;
        }

        for (const matchId in activeMatches) {
            const match = activeMatches[matchId];
            if (match.players[socket.id]) {
                console.log(`[MATCH ${matchId}] Player ${username} disconnected. Ending match.`);
                
                const opponentId = Object.keys(match.players).find(id => id !== socket.id);
                if (opponentId) {
                    const opponentSocket = match.players[opponentId].socket;
                    if (opponentSocket) {
                         opponentSocket.emit('match_ended_opponent_disconnect', {
                            winner: match.players[opponentId].username,
                            finalScore: match.players[opponentId].score 
                         });
                    }
                }
                
                delete activeMatches[matchId];
                break;
            }
        }
    });
});


// --- 7. SERVER STARTUP ---

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('--- DYNAMIC TESTING READY ---');
    console.log('1. Go to /signup to create an account.');
    console.log('2. Immediately go to /login to test authentication.');
});
