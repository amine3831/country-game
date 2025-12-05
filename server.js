// server.js (FULL FIXED VERSION)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io'); 

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Middleware to parse JSON bodies and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- 2. IN-MEMORY TESTING DATABASE & GAME DATA ---
let users = []; 
console.log(`✅ In-Memory Test Database initialized with ${users.length} users (empty).`);

// --- ADDED FUNCTION: PRINT ALL USERS ---
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

// Log initial state (which is empty)
logAllUsers(); 
// --- END ADDED FUNCTION ---

let flagData = []; 
let CONFUSION_GROUPS_MAP = {}; 

try {
    const rawFlagData = require('./flag_data.json'); 
    flagData = rawFlagData.map(item => ({
        ...item,
        country: item.correctAnswer, 
        image: item.image, 
    }));
    
    // Load confusion groups from the groups.js file
    const groupsModule = require('./groups');
    CONFUSION_GROUPS_MAP = groupsModule.CONFUSION_GROUPS_MAP;
    
    console.log(`✅ Loaded ${flagData.length} flags.`);
    console.log(`✅ Loaded ${Object.keys(CONFUSION_GROUPS_MAP).length} confusion groups.`);
    
} catch (error) {
    console.error("Error loading game data (flag_data.json or groups.js):", error.message);
}

// Global variable to manage SOLO game sessions (HTTP-based)
// Key: userId, Value: { currentQuestionIndex: number, currentStreak: number, lastQuestion: object }
let simpleGameSessions = {};

// Global variables for Multiplayer Matchmaking (Socket-based)
let waitingPlayer = null; // { userId: string, username: string, socket: Socket }
let activeMatches = {}; // { matchId: { players: { socketId: { userId, username, score, socket } }, round: number, currentQuestion: object } }


// --- 3. UTILITY FUNCTIONS (UNCHANGED) ---\n
/** Finds a country object by its name. */
function findCountryByName(name) {
    return flagData.find(f => f.country.toLowerCase() === name.toLowerCase());
}

/** Finds a user in the in-memory database by ID. */
function findUserById(id) {
    return users.find(u => u.id === id);
}

/** Finds a user in the in-memory database by username. */
function findUserByUsername(username) {
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

/** Finds a user in the in-memory database by ID or creates a new one (for session testing). */
function findOrCreateUser(id, username) {
    let user = findUserById(id);
    if (!user) {
        user = { id, username, password: 'password', highScore: 0 }; // Simple default password
        users.push(user);
        console.log(`[AUTH] Created new test user: ${username}`);
    }
    return user;
}

/** Generates a random set of options based on the correct country. */
function generateOptions(correctCountry) {
    const options = new Set([correctCountry.country]);
    const allCountryNames = flagData.map(f => f.country);

    // 1. Try to pull from a confusion group if available
    for (const groupName in CONFUSION_GROUPS_MAP) {
        if (CONFUSION_GROUPS_MAP[groupName].includes(correctCountry.country)) {
            const group = CONFUSION_GROUPS_MAP[groupName].filter(c => c !== correctCountry.country);
            // Add up to 2 other options from the group
            while (options.size < 3 && group.length > 0) {
                const randomIndex = Math.floor(Math.random() * group.length);
                options.add(group.splice(randomIndex, 1)[0]);
            }
            break;
        }
    }

    // 2. Fill the rest with truly random options
    while (options.size < 4) {
        const randomCountryName = allCountryNames[Math.floor(Math.random() * allCountryNames.length)];
        options.add(randomCountryName);
    }

    // Convert Set to Array and shuffle
    let optionsArray = Array.from(options);
    for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
    }

    return optionsArray;
}


// --- 4. NEW SOLO GAME LOGIC (HTTP-BASED) ---

/** Generates a new random question for the Solo Game. */
function generateSimpleQuestion() {
    // Select a random country
    const randomIndex = Math.floor(Math.random() * flagData.length);
    const correctCountry = flagData[randomIndex];

    return {
        id: correctCountry.id, // Not strictly needed, but useful for tracking
        flagImage: correctCountry.image,
        correctAnswer: correctCountry.country, // Stored server-side for validation
        options: generateOptions(correctCountry)
    };
}

// --- 5. EXPRESS ROUTES (HTTP) ---

// Serve static files (HTML, CSS, client scripts)
app.use(express.static(path.join(__dirname, '/')));

// Root redirect to main page (which forces auth check)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Signup Page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Simple Game Page (Now served via HTTP)
app.get('/simple_game', (req, res) => {
    // Basic auth check: ensures userId and username are present in query params
    if (!req.query.userId || !req.query.username) {
        return res.redirect('/login');
    }
    // Only serve the page. The client-side logic will handle API calls.
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});

// Logout Route (Clears session data for simplicity)
app.get('/logout', (req, res) => {
    // In a real app, this would destroy the session cookie/token. 
    // Here, we just redirect to remove the query parameters.
    res.redirect('/login?message=Logged out successfully.');
});


// --- 5.1. AUTHENTICATION (POST ROUTES) ---

app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    if (findUserByUsername(username)) {
        return res.redirect('/signup?error=Username already taken.');
    }

    // In-memory unique ID generation (simple timestamp + random)
    const id = 'user-' + Date.now() + Math.floor(Math.random() * 1000);
    users.push({ id, username, password, highScore: 0 }); // HighScore initialized at 0
    console.log(`[AUTH] User signed up: ${username}`);
    logAllUsers();
    
    res.redirect(`/login?status=success&username=${username}`);
});


app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (user) {
        console.log(`[AUTH] User logged in: ${user.username}`);
        // Pass essential data back in the URL for stateless authentication (for this test environment)
        res.redirect(`/?userId=${user.id}&username=${user.username}`);
    } else {
        res.redirect('/login?error=Invalid username or password.');
    }
});


// --- 5.2. SOLO GAME API ENDPOINTS (NEW HTTP LOGIC) ---

/**
 * Endpoint to start a new game or get the next question for a solo player.
 */
app.get('/api/simple/get_question', (req, res) => {
    const userId = req.query.userId;
    const user = findUserById(userId);

    if (!user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    // Start a new session or reset an existing one
    if (!simpleGameSessions[userId] || req.query.reset === 'true') {
        simpleGameSessions[userId] = { 
            currentStreak: 0, 
            lastQuestion: null,
            highScore: user.highScore // Track user's best score
        };
        console.log(`[SOLO API] Session started/reset for ${user.username}`);
    }

    const question = generateSimpleQuestion();
    
    // Store the correct answer for the next validation request
    simpleGameSessions[userId].lastQuestion = question;

    // Return the data needed by the client (excluding the correct answer)
    return res.json({
        flagImage: question.flagImage,
        options: question.options,
        currentStreak: simpleGameSessions[userId].currentStreak,
        highScore: simpleGameSessions[userId].highScore
    });
});

/**
 * Endpoint to submit an answer and get the result.
 */
app.post('/api/simple/submit_answer', (req, res) => {
    const { userId, answer } = req.body;
    const user = findUserById(userId);
    const session = simpleGameSessions[userId];

    if (!user || !session || !session.lastQuestion) {
        return res.status(400).json({ error: 'Invalid session or missing question data.' });
    }

    const correct = session.lastQuestion.correctAnswer;
    const isCorrect = (answer === correct);

    let finalStreak = session.currentStreak;
    let newHighScore = user.highScore;
    let gameStatus = 'continue'; // default

    if (isCorrect) {
        session.currentStreak += 1;
        
        // Update high score if current streak exceeds it
        if (session.currentStreak > user.highScore) {
            user.highScore = session.currentStreak;
            newHighScore = user.highScore;
        }
        finalStreak = session.currentStreak;
        console.log(`[SOLO API] Correct answer for ${user.username}. Streak: ${finalStreak}`);

    } else {
        // Game Over: reset streak and update user data
        gameStatus = 'game_over';
        finalStreak = session.currentStreak; // The streak achieved
        session.currentStreak = 0; // Reset for next game
        console.log(`[SOLO API] Incorrect answer for ${user.username}. Game Over. Streak: ${finalStreak}`);
    }

    // Clear the question to prevent double submission
    session.lastQuestion = null; 

    // Send the result back to the client
    return res.json({
        isCorrect: isCorrect,
        correctAnswer: correct,
        currentStreak: finalStreak,
        highScore: newHighScore,
        status: gameStatus
    });
});


// --- 6. SOCKET.IO MULTIPLAYER LOGIC (UNCHANGED CORE LOGIC) ---

io.on('connection', (socket) => {
    // The socket only connects now if the user hits the multiplayer button
    // It should have query parameters if it connected successfully via client_auth_menu.js

    const userId = socket.handshake.query.userId;
    const username = socket.handshake.query.username;

    if (!userId || !username) {
        console.log(`[SOCKET AUTH] Anonymous connection rejected.`);
        return socket.disconnect(true);
    }

    const user = findOrCreateUser(userId, username);
    socket.emit('auth_successful', { userId: user.id, username: user.username });
    
    console.log(`[SOCKET] User connected: ${username} (${socket.id})`);


    // --- 6.1. MULTIPLAYER: START MATCHMAKING ---

    socket.on('start_multiplayer', () => {
        if (waitingPlayer && waitingPlayer.userId !== userId) {
            
            // Player 2 found: Start the match!
            const matchId = `match-${Date.now()}`;
            const player1 = waitingPlayer;
            const player2 = { userId, username, socket };
            
            activeMatches[matchId] = {
                players: { 
                    [player1.socket.id]: { userId: player1.userId, username: player1.username, score: 0, socket: player1.socket },
                    [player2.socket.id]: { userId: player2.userId, username: player2.username, score: 0, socket: player2.socket }
                },
                round: 0,
                currentQuestion: null,
                answersReceived: 0,
                answerTimestamps: {}
            };

            // Clear the waiting list
            waitingPlayer = null;

            // Create a room and notify both players
            player1.socket.join(matchId);
            player2.socket.join(matchId);

            console.log(`[MATCH ${matchId}] Match started between ${player1.username} and ${player2.username}`);

            io.to(matchId).emit('match_found', { 
                matchId: matchId,
                player1: { userId: player1.userId, username: player1.username, score: 0, isP1: true },
                player2: { userId: player2.userId, username: player2.username, score: 0, isP1: false },
                round: 0
            });

            // Start the first round after a small delay to allow clients to update UI
            setTimeout(() => startNewMultiplayerRound(matchId), 1000);

        } else if (!waitingPlayer) {
            // Player 1: Wait for opponent
            waitingPlayer = { userId, username, socket };
            console.log(`[MATCHMAKING] ${username} is now waiting for an opponent.`);
            
        } else {
            // Self-reconnect or repeated click
            socket.emit('status_update', 'Already waiting for an opponent. Please wait...');
        }
    });

    // --- 6.2. MULTIPLAYER: GAME ROUND LOGIC ---

    function startNewMultiplayerRound(matchId) {
        const match = activeMatches[matchId];
        if (!match) return; 

        // Check for max rounds (e.g., 5 rounds)
        if (match.round >= 5) {
            return endMultiplayerMatch(matchId);
        }

        // Increment round
        match.round++;
        match.answersReceived = 0;
        match.answerTimestamps = {};

        // Generate the new question
        const question = generateSimpleQuestion(); // Reuse the core question generator
        match.currentQuestion = question;
        
        // Notify all players in the room
        io.to(matchId).emit('new_round_data', {
            round: match.round,
            flagImage: question.flagImage,
            options: question.options,
            scores: getMatchScores(match)
        });

        console.log(`[MATCH ${matchId}] Round ${match.round} started. Flag: ${question.correctAnswer}`);

        // Set a timeout for the round (e.g., 15 seconds)
        // setTimeout(() => checkEndOfRound(matchId), 15000); // 15 seconds per round
    }

    function endMultiplayerMatch(matchId) {
        const match = activeMatches[matchId];
        if (!match) return;

        const scores = getMatchScores(match);
        let winnerName, winnerScore = -1;

        // Determine winner
        const p1 = Object.values(match.players)[0];
        const p2 = Object.values(match.players)[1];
        
        if (scores[p1.userId] > scores[p2.userId]) {
            winnerName = p1.username;
            winnerScore = scores[p1.userId];
        } else if (scores[p2.userId] > scores[p1.userId]) {
            winnerName = p2.username;
            winnerScore = scores[p2.userId];
        } else {
            winnerName = "Tie";
        }

        console.log(`[MATCH ${matchId}] Match ended. Winner: ${winnerName}. Scores: P1:${scores[p1.userId]}, P2:${scores[p2.userId]}`);

        io.to(matchId).emit('match_ended', {
            winner: winnerName,
            finalScores: scores
        });

        // Clean up match
        delete activeMatches[matchId];
    }

    function getMatchScores(match) {
        const scores = {};
        for (const socketId in match.players) {
            const player = match.players[socketId];
            scores[player.userId] = player.score;
        }
        return scores;
    }


    socket.on('submit_multiplayer_answer', ({ matchId, answer }) => {
        const match = activeMatches[matchId];
        if (!match || match.answersReceived >= 2 || match.answerTimestamps[userId]) return;

        const player = match.players[socket.id];
        const currentTime = Date.now();
        match.answerTimestamps[userId] = currentTime;

        const correct = match.currentQuestion.correctAnswer;
        const isCorrect = (answer === correct);
        
        let points = 0;
        if (isCorrect) {
            // Simple scoring: 1 point per correct answer
            points = 1; 
            player.score += points;
            console.log(`[MATCH ${matchId}] ${player.username} submitted correct answer.`);
        } else {
            console.log(`[MATCH ${matchId}] ${player.username} submitted incorrect answer.`);
        }
        
        match.answersReceived++;

        // Notify opponent that the answer has been submitted
        socket.broadcast.to(matchId).emit('opponent_answered', {
            username: player.username
        });
        
        // Notify the player of their result
        socket.emit('answer_result', {
            isCorrect: isCorrect,
            correctAnswer: correct,
            score: player.score,
            timeTaken: (currentTime - (match.roundStartTime || 0)) / 1000 // Simple time tracking
        });


        // Check if both players have answered
        if (match.answersReceived === 2) {
            console.log(`[MATCH ${matchId}] Both players answered round ${match.round}.`);
            // Wait a moment for clients to see results, then start next round
            setTimeout(() => startNewMultiplayerRound(matchId), 3000); 
        }
    });


    // --- 6.3. MULTIPLAYER: DISCONNECT HANDLING (Updated Log) ---

    socket.on('disconnect', () => {
        const user = findUserById(userId);
        const username = user ? user.username : 'Unknown';
        console.log(`[SOCKET DISCONNECT] ${username} (${socket.id}) disconnected.`);

        // 1. Check if the disconnected user was in the waiting list
        if (waitingPlayer && waitingPlayer.userId === userId) {
            console.log(`[MATCHMAKING] Cleared waiting player: ${username}`);
            waitingPlayer = null;
        }

        // 2. Check if the disconnected user was in an active match
        for (const matchId in activeMatches) {
            const match = activeMatches[matchId];
            if (match.players[socket.id]) {
                console.log(`[MATCH ${matchId}] Player ${username} disconnected. Ending match.`);
                
                // Get the opponent's socket ID (which is the key in the match.players object)
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
    console.log('1. Go to /signup to create an account.');
    console.log('2. Immediately go to /login to test authentication.');
});

