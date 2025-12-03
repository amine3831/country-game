// server.js (FINAL CONSOLIDATED VERSION - Solo & Multiplayer Working)

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

// Global state for multiplayer
let waitingPlayer = null; 
const activeMatches = {};  
const MAX_ROUNDS = 10;
const ROUND_TIME_LIMIT_MS = 10000; // Multiplayer round time

// Data loaded from JSON files
let flagData = []; 
let CONFUSION_GROUPS_MAP = {}; 

try {
    const rawFlagData = require('./flag_data.json'); 
    flagData = rawFlagData.map(item => ({
        ...item,
        country: item.correctAnswer, 
        image: item.image, 
    }));
    
    // Assuming 'groups' file exists and exports the map
    CONFUSION_GROUPS_MAP = require('./groups');
    if (typeof CONFUSION_GROUPS_MAP === 'object' && CONFUSION_GROUPS_MAP !== null && !Array.isArray(CONFUSION_GROUPS_MAP)) {
        CONFUSION_GROUPS_MAP = CONFUSION_GROUPS_MAP.CONFUSION_GROUPS_MAP || CONFUSION_GROUPS_MAP.groups || CONFUSION_GROUPS_MAP;
    }

    console.log(`✅ Flag data loaded: ${flagData.length} flags.`);
} catch (error) {
    console.error("❌ CRITICAL ERROR: Failed to load game data or groups map. Game will not function:", error.message);
}

// Log initial state (and all users)
function logAllUsers() {
    console.log("--- CURRENT REGISTERED USERS ---");
    if (users.length === 0) {
        console.log("No users currently registered in memory.");
        return;
    }
    users.forEach((user, index) => {
        // Only printing non-sensitive data (ID, username, score)
        console.log(
            `[${index + 1}] Username: ${user.username}, ID: ${user.id}, High Score: ${user.highScore}`
        );
    });
    console.log("----------------------------------");
}
console.log(`✅ In-Memory Test Database initialized with ${users.length} users (empty).`);
logAllUsers(); 


// --- 3. EXPRESS SETUP ---

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 


// --- 4. UTILITY FUNCTIONS (Shared by both modes) ---

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

// ⬅️ SOLO GAME UTILITY FUNCTION
function startSoloRound(socket) {
    if (!flagData || flagData.length === 0) {
        return socket.emit('server_error', { message: "Game data unavailable." });
    }
    
    const randomFlag = flagData[Math.floor(Math.random() * flagData.length)];
    const options = generateQuizOptions(randomFlag.country);
    
    const user = users.find(u => u.id === socket.userId);
    const highScore = user ? user.highScore : 0; 

    // Store the correct answer on the socket instance for round validation
    socket.soloRoundData = {
        correctAnswer: randomFlag.country
    };

    console.log(`[SOLO] Starting new round for ${socket.username}. Flag: ${randomFlag.country}`);

    socket.emit('solo_new_round', {
        image: randomFlag.image,
        options: options,
        highScore: highScore,
    });
}

function updateSoloHighScore(userId, newScore) {
    const user = users.find(u => u.id === userId);
    if (user && newScore > user.highScore) {
        user.highScore = newScore;
        return true;
    }
    return false;
}
// ... (Your Multiplayer functions startMultiplayerRound, startNextMultiplayerRound, endMatch remain here) ...

function startMultiplayerRound(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    if (match.questionIndex >= MAX_ROUNDS - 1) {
        endMatch(matchId);
        return;
    }

    match.questionIndex++;
    match.currentFlag = match.questions[match.questionIndex];

    Object.values(match.players).forEach(p => {
        p.answeredThisRound = false;
    });

    const options = generateQuizOptions(match.currentFlag.country);

    console.log(`[MATCH ${matchId}] Starting Round ${match.questionIndex + 1}. Flag: ${match.currentFlag.country}`);

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

    match.roundTimer = setTimeout(() => {
        startNextMultiplayerRound(matchId);
    }, ROUND_TIME_LIMIT_MS);
}

function startNextMultiplayerRound(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;
    
    if (match.questionIndex >= MAX_ROUNDS - 1) {
        endMatch(matchId);
    } else {
        startMultiplayerRound(matchId);
    }
}

function endMatch(matchId) {
    const match = activeMatches[matchId];
    if (!match) return;

    const playerScores = Object.values(match.players).map(p => ({ username: p.username, score: p.score }));
    playerScores.sort((a, b) => b.score - a.score);

    const winner = playerScores[0].score > playerScores[1].score ? playerScores[0].username : 
                   playerScores[0].score < playerScores[1].score ? playerScores[1].username : 'Tie';
    
    console.log(`[MATCH ${matchId}] Match Ended. Winner: ${winner}. Scores: ${playerScores[0].username} (${playerScores[0].score}) vs ${playerScores[1].username} (${playerScores[1].score})`);

    io.to(matchId).emit('match_game_over', {
        scores: playerScores,
        winner: winner,
    });
    
    delete activeMatches[matchId];
}


// --- 5. EXPRESS ROUTES ---
// ... (Your Express routes remain here) ...

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
        
        // --- ENHANCED LOG ---
        console.log(`✅ [SIGNUP] New user signed up: ${username} (ID: ${newUser.id}). Total users: ${users.length}`);
        logAllUsers(); 
        
        res.redirect('/login?status=success&username=' + username);
        
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("Registration failed due to a server error.");
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).send("Login failed: Invalid username or password.");

    if (password.trim() === user.password.trim()) { 
        const userId = user.id;
        console.log(`✅ User logged in: ${username} (ID: ${userId})`);
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
        socket.emit('unauthorized_access');
        return socket.disconnect(true);
    }
    
    username = user.username;
    
    // ⬅️ CRITICAL FIX: Attach properties to the socket instance for use in handlers
    socket.userId = userId; 
    socket.username = username;
    
    console.log(`[SOCKET] User connected: ${username} (ID: ${userId})`);
    socket.emit('auth_successful', { username: username });

    
    // ------------------------------------------------------------------
    // ✅ SOLO GAME HANDLERS
    // ------------------------------------------------------------------

    // 1. Client requests to start the solo game
    socket.on('start_solo_game', () => {
        // Initialize user's current solo score state on the socket
        socket.currentSoloStreak = 0;
        startSoloRound(socket);
    });
    
    // 2. Client requests a new round (after a correct answer)
    socket.on('request_solo_round', () => {
        startSoloRound(socket);
    });

    // 3. Client submits an answer
    socket.on('submit_solo_answer', (data) => {
        const answer = data.answer;
        const soloData = socket.soloRoundData;

        if (!soloData) return; // Ignore if no round is active

        const isCorrect = answer === soloData.correctAnswer;
        
        if (isCorrect) {
            socket.currentSoloStreak++;
            
            // Check and update High Score
            updateSoloHighScore(socket.userId, socket.currentSoloStreak);
            
        } else {
            // Game Over for solo mode
            const finalScore = socket.currentSoloStreak;
            socket.currentSoloStreak = 0; // Reset streak
            
            const user = users.find(u => u.id === socket.userId);
            const highScore = user ? user.highScore : 0; // Get updated high score

            socket.emit('solo_game_over', { 
                score: finalScore, 
                highScore: highScore 
            });
        }
        
        // Send feedback back to the client
        socket.emit('solo_feedback', { 
            isCorrect: isCorrect, 
            correctAnswer: soloData.correctAnswer 
        });
    });


    // ------------------------------------------------------------------
    // --- MULTIPLAYER HANDLERS (STABILITY FIX INCLUDED) ---
    // ------------------------------------------------------------------
    socket.on('start_multiplayer', () => {
        if (!flagData || flagData.length === 0) {
            return socket.emit('server_error', { message: "Game data unavailable." });
        }

        console.log(`[MULTIPLAYER] ${username} (ID: ${userId}) wants to start.`);

        // CRITICAL FIX: Check against socket.id for same-browser stability
        if (waitingPlayer && waitingPlayer.socketId !== socket.id) { 
            const player1 = waitingPlayer;
            const player1Socket = io.sockets.sockets.get(player1.socketId);

            if (!player1Socket) {
                console.error("Waiting player disconnected. Resetting queue.");
                waitingPlayer = { userId, socketId: socket.id, username };
                console.log(`🔎 [MULTIPLAYER] ${username} (ID: ${userId}) is now SEARCHING for an opponent.`);
                return socket.emit('searching');
            }

            // Match Creation (Player 2 joining Player 1)
            const matchId = generateMatchId();
            const matchQuestions = shuffleArray([...flagData]).slice(0, MAX_ROUNDS);

            activeMatches[matchId] = {
                id: matchId,
                players: {
                    [player1.socketId]: { username: player1.username, score: 0, socket: player1Socket },
                    [socket.id]: { username, score: 0, socket }
                },
                questionIndex: -1,
                questions: matchQuestions,
                currentFlag: null,
                roundTimer: null
            };

            waitingPlayer = null;

            player1Socket.join(matchId);
            socket.join(matchId);

            console.log(`✅ MATCH STARTED: ${player1.username} vs ${username} (ID: ${matchId})`);

            io.to(matchId).emit('match_started', {
                matchId,
                playerMap: {
                    [player1.socketId]: player1.username,
                    [socket.id]: username
                }
            });

            setTimeout(() => startMultiplayerRound(matchId), 1000);

        } else {
            // Player 1: Register as waiting
            waitingPlayer = { userId, socketId: socket.id, username };
            
            // --- ENHANCED LOG ---
            console.log(`🔎 [MULTIPLAYER] ${username} (ID: ${userId}) is now SEARCHING for an opponent.`);
            
            socket.emit('searching');
        }
    });

    socket.on('submit_multiplayer_answer', (data) => {
        const { matchId, answer } = data;
        const match = activeMatches[matchId];
        if (!match || match.questionIndex === -1) return;
        
        const playerId = socket.id;
        if (match.players[playerId]?.answeredThisRound) return; 

        const currentQuestion = match.questions[match.questionIndex];
        const isCorrect = answer === currentQuestion.country;
        
        match.players[playerId].answeredThisRound = true;
        if (isCorrect) match.players[playerId].score += 1;

        socket.emit('multiplayer_feedback', { isCorrect: isCorrect, correctAnswer: currentQuestion.country });

        const allAnswered = Object.values(match.players).every(p => p.answeredThisRound);
        if (allAnswered) {
            clearTimeout(match.roundTimer);
            startNextMultiplayerRound(matchId);
        }
    });

    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', () => { 
        
        if (waitingPlayer && waitingPlayer.socketId === socket.id) {
            console.log(`[MULTIPLAYER] Cleared waiting player: ${username}`);
            waitingPlayer = null;
        }

        for (const matchId in activeMatches) {
            const match = activeMatches[matchId];
            if (match.players[socket.id]) {
                console.log(`[MATCH ${matchId}] Player ${username} disconnected. Ending match.`);
                
                const opponentSocketId = Object.keys(match.players).find(id => id !== socket.id);
                if (opponentSocketId) {
                    const opponentSocket = match.players[opponentSocketId].socket;
                    if (opponentSocket) {
                         opponentSocket.emit('match_ended_opponent_disconnect', {
                            winner: match.players[opponentSocketId].username,
                            finalScore: match.players[opponentSocketId].score 
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
});
