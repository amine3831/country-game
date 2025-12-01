// server.js (COMPLETE UNIFIED CODE)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 2. DATA LOADING (Adjust paths if necessary) ---
// Assuming flag_data.json and groups.js are in the same directory
const flagData = require('./flag_data.json'); 
const { CONFUSION_GROUPS_MAP } = require('./groups'); // Assuming groups.js exports this

// --- 3. GLOBAL STATE & CONFIGURATION ---

// In a real app, this would be a database call
const users = {
    // Populate with actual users or read from a 'db' file if necessary
}; 

// Game state variables
let waitingPlayer = null; 
const activeMatches = {};  
const simpleGames = {}; // Track active simple games { socketId: { matchId, currentStreak, highScore, matchQuestions, ... } }
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
    if (needed > 0) {
        const allCountries = flagData.map(f => f.country);
        const randomOptions = selectUniqueRandom(allCountries, needed, options);
        options.push(...randomOptions);
    }
    
    return shuffleArray(options).slice(0, 4); // Ensure exactly 4 options and shuffle them
}

/** Starts the next round for a single-player simple game. */
function startSimpleGameRound(playerId) {
    const game = simpleGames[playerId];
    if (!game) return;

    // Move to the next question
    game.currentQuestionIndex++;
    
    // Loop questions if we run out (for simplicity)
    const questionIndex = game.currentQuestionIndex % game.matchQuestions.length; 
    const currentQuestion = game.matchQuestions[questionIndex];
    
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

// 💡 FIX FOR Cannot GET /simple_game
app.get('/simple_game', (req, res) => {
    // Note: The file simple_game.html MUST be in the same directory
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Placeholder for actual login logic
app.post('/login', (req, res) => {
    // In a real app: check credentials, set cookie/session, redirect with userId query param
    const username = req.body.username || 'Guest';
    const userId = 'user_' + Math.random().toString(36).substring(2, 8);
    // Redirect to main page with userId query parameter for client-side auth
    res.redirect(`/?userId=${userId}`); 
});

// Placeholder for logout
app.get('/logout', (req, res) => {
    // In a real app: clear session/cookie
    res.redirect('/login');
});

// --- 6. SOCKET.IO EVENT HANDLERS (Simplified) ---

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    let username = 'Guest'; // Default
    
    // Auth Check
    if (!userId) {
        socket.emit('unauthorized_access');
        return socket.disconnect(true);
    }
    // Simple placeholder for auth successful
    console.log(`Authenticated user connected: ${username} (ID: ${userId})`);
    socket.emit('auth_successful', { username: username });

    
    // --- SIMPLE GAME HANDLERS ---

    // A. Start Simple Game Session (triggered when user lands on simple_game.html)
    socket.on('start_simple_session', () => {
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
        
        console.log(`Simple Game session started for user ${socket.id}.`);
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
            // We keep the game object to store the high score for the session
        }
    });

    // --- MULTIPLAYER PLACEHOLDERS ---
    socket.on('request_multiplayer_match', () => { 
        socket.emit('waiting_for_opponent');
        // Your existing matchmaking logic would go here
    });

    socket.on('submit_answer', (data) => {
        // Your existing multiplayer answer logic would go here
    });


    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', () => { 
        delete simpleGames[socket.id];
        // Your existing multiplayer cleanup logic would go here
    });
});


// --- 7. SERVER STARTUP ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
