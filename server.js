// server.js (COMPLETE UNIFIED CODE with Scope Fixed)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 2. DATA LOADING (CRITICAL FIX: Declare variables globally) ---
let flagData = []; // Declared globally
let CONFUSION_GROUPS_MAP = {}; // Declared globally

try {
    // The variables are ASSIGNED here, making them accessible everywhere below
    flagData = require('./flag_data.json'); 
    const groupsModule = require('./groups');
    CONFUSION_GROUPS_MAP = groupsModule.CONFUSION_GROUPS_MAP || {};
    
    console.log(`✅ Data loaded: ${flagData.length} flags.`);
    if (flagData.length === 0) {
         console.error("⚠️ WARNING: flag_data.json is empty.");
    }
} catch (error) {
    console.error("❌ CRITICAL ERROR: Failed to load game data (flag_data.json or groups.js). Game will not function:", error.message);
}


// --- 3. GLOBAL STATE & CONFIGURATION ---

const users = {}; 
let waitingPlayer = null; 
const activeMatches = {};  
const simpleGames = {}; 
const MAX_ROUNDS = 10;
const ROUND_TIME_LIMIT_MS = 10000;

// Middleware for serving static files
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
    const pool = sourceArr.filter(item => !excludeArr.includes(item));
    return shuffleArray(pool).slice(0, count);
}

function generateQuizOptions(correctCountry) {
    const options = [correctCountry];
    const group = CONFUSION_GROUPS_MAP[correctCountry];

    if (group) {
        // 1. Try to pull 3 options from the confusion group
        const groupOptions = selectUniqueRandom(group, 3);
        options.push(...groupOptions);
    }

    // 2. Fill remaining options with random countries
    const needed = 4 - options.length;
    if (needed > 0 && flagData.length > 0) {
        const allCountries = flagData.map(f => f.country);
        const randomOptions = selectUniqueRandom(allCountries, needed, options);
        options.push(...randomOptions);
    }
    
    // Safety check: ensure 4 unique options
    return shuffleArray([...new Set(options)]).slice(0, 4); 
}

/** Starts the next round for a single-player simple game. */
function startSimpleGameRound(playerId) {
    const game = simpleGames[playerId];
    if (!game) {
        console.error(`ERROR: Game object not found for playerId: ${playerId}`);
        return;
    }
    
    // Safety check: Avoid index issues if matchQuestions is empty
    if (game.matchQuestions.length === 0) {
         console.error("DATA ERROR: matchQuestions is empty! Cannot start round.");
         return;
    }

    // Move to the next question
    game.currentQuestionIndex++;
    
    const questionIndex = game.currentQuestionIndex % game.matchQuestions.length; 
    const currentQuestion = game.matchQuestions[questionIndex];
    
    // --- DEBUG LOGS AND CHECKS ---
    if (!currentQuestion || !currentQuestion.country || !currentQuestion.image) {
        console.error("DATA ERROR: Current question is incomplete or undefined at index", questionIndex, currentQuestion);
        return;
    }
    console.log(`[SIMPLE] Starting Round ${game.currentStreak + 1}. Flag: ${currentQuestion.country}`);
    // --- END DEBUG LOGS ---
    
    const options = generateQuizOptions(currentQuestion.country);

    // Send the new round data back to the player
    io.to(playerId).emit('simple_new_round', {
        streak: game.currentStreak,
        highScore: game.highScore, // Include high score for display
        image: currentQuestion.image,
        options: options
    });
}
// ... (Multiplayer: startGameRound, endGame, etc. functions would go here) ...


// --- 5. EXPRESS ROUTES (Auth placeholders) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// FIX FOR Cannot GET /simple_game
app.get('/simple_game', (req, res) => {
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
    const username = req.body.username || 'Guest';
    const userId = 'user_' + Math.random().toString(36).substring(2, 8);
    res.redirect(`/?userId=${userId}`); 
});

app.get('/logout', (req, res) => {
    res.redirect('/login');
});

// --- 6. SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    let username = 'Guest'; 
    
    // Auth Check
    if (!userId) {
        console.error("Authentication Failed: userId missing from socket query. Disconnecting socket.");
        socket.emit('unauthorized_access');
        return socket.disconnect(true);
    }
    console.log(`[SOCKET] User connected: ${username} (ID: ${userId})`);
    socket.emit('auth_successful', { username: username });

    
    // --- SIMPLE GAME HANDLERS ---

    // A. Start Simple Game Session (triggered when user lands on simple_game.html)
    socket.on('start_simple_session', () => {
        
        // --- CRITICAL CHECK ---
        if (!flagData || flagData.length === 0) {
            console.error("FATAL ERROR: flagData is empty or not loaded. Cannot start game.");
            // Notify client to prevent indefinite stall
            socket.emit('server_error', { message: "Game data is unavailable on the server. Check server logs." });
            return; 
        }
        // ---------------------------------

        if (simpleGames[socket.id]) {
            delete simpleGames[socket.id]; 
        }

        const shuffledQuestions = shuffleArray([...flagData]); 
        
        simpleGames[socket.id] = {
            id: generateMatchId(), 
            playerId: socket.id, 
            currentStreak: 0,
            highScore: 0, 
            matchQuestions: shuffledQuestions, 
            currentQuestionIndex: -1,
        };
        
        console.log(`[SIMPLE] Session started for ${socket.id}. Attempting first round...`);
        startSimpleGameRound(socket.id); 
    });


    // B. Simple Game Answer Submission Handler
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
            
            if (finalStreak > game.highScore) {
                game.highScore = finalStreak;
            }
            
            socket.emit('simple_game_over', {
                finalStreak: finalStreak,
                highScore: game.highScore
            });
        }
    });

    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', () => { 
        delete simpleGames[socket.id];
        // ... (multiplayer cleanup) ...
    });
});


// --- 7. SERVER STARTUP ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
