// server.js (FINAL, UNIFIED, WORKING CODE)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io'); 
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 2. DATA LOADING ---
let flagData = []; 
let CONFUSION_GROUPS_MAP = {}; 

try {
    // Attempt to load flag_data.json
    const rawFlagData = require('./flag_data.json'); 
    
    // FIX: Map 'correctAnswer' key to 'country' key
    flagData = rawFlagData.map(item => ({
        ...item,
        country: item.correctAnswer, 
        image: item.image, 
    }));
    
    // Load the groups map directly
    CONFUSION_GROUPS_MAP = require('./groups');
    
    // Check for nested map structure for robustness
    if (typeof CONFUSION_GROUPS_MAP === 'object' && CONFUSION_GROUPS_MAP !== null && !Array.isArray(CONFUSION_GROUPS_MAP)) {
        CONFUSION_GROUPS_MAP = CONFUSION_GROUPS_MAP.CONFUSION_GROUPS_MAP || CONFUSION_GROUPS_MAP.groups || CONFUSION_GROUPS_MAP;
    }

    console.log(`✅ Data loaded: ${flagData.length} flags.`);
} catch (error) {
    console.error("❌ CRITICAL ERROR: Failed to load game data or groups map. Game will not function:", error.message);
}


// --- 3. GLOBAL STATE & CONFIGURATION ---

const users = {}; 
let waitingPlayer = null; 
const activeMatches = {};  
const simpleGames = {}; 
const MAX_ROUNDS = 10;
const ROUND_TIME_LIMIT_MS = 10000;

// Middleware for serving static files and parsing request body
app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true })); // For parsing x-www-form-urlencoded
app.use(express.json()); // For parsing application/json

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
    // Filter the source array to remove excluded items
    const selectionPool = sourceArr.filter(item => !excludeArr.includes(item));
    return shuffleArray(selectionPool).slice(0, count);
}

/**
 * Generates quiz options (4 total) based on the custom Confusion Groups Map.
 */
function generateQuizOptions(correctCountry) {
    const ALL_COUNTRIES_NAMES = flagData.map(flag => flag.country);
    let distractors = [];
    let groupCountries = null;
    const requiredDistractors = 3; 

    // --- PROVEN LOGIC: Find the Group for the correct country by looping through all groups ---
    for (const key in CONFUSION_GROUPS_MAP) {
        // Check if the current group array contains the correct country name
        if (CONFUSION_GROUPS_MAP[key].includes(correctCountry)) {
            groupCountries = CONFUSION_GROUPS_MAP[key];
            break; // Found the group, stop searching
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
    
    // Safety check: ensure 4 options are generated.
    if (finalOptions.length !== 4) {
        // Use emergency random fallback if the length is wrong
        console.error(`Error generating options for ${correctCountry}. Generated ${finalOptions.length} options. Using random fallback.`);
        const backupDistractors = selectUniqueRandom(ALL_COUNTRIES_NAMES, 3, [correctCountry]);
        return shuffleArray([correctCountry, ...backupDistractors]);
    }
    
    return shuffleArray(finalOptions);
}


/** Starts the next round for a single-player simple game. */
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

    // Move to the next question
    game.currentQuestionIndex++;
    
    const questionIndex = game.currentQuestionIndex % game.matchQuestions.length; 
    const currentQuestion = game.matchQuestions[questionIndex];
    
    
    if (!currentQuestion || typeof currentQuestion.country !== 'string' || currentQuestion.country.length === 0) {
        console.error("DATA ERROR: Current question object is invalid or country name is missing.");
        return;
    }
    console.log(`[SIMPLE] Starting Round ${game.currentStreak + 1}. Flag: ${currentQuestion.country}`);
    
    const options = generateQuizOptions(currentQuestion.country);

    // Send the new round data back to the player
    io.to(playerId).emit('simple_new_round', {
        streak: game.currentStreak,
        highScore: game.highScore, 
        image: currentQuestion.image,
        options: options
    });
}


// --- 5. EXPRESS ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// CRITICAL FIX: Route to serve the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Route for the simple game HTML
app.get('/simple_game', (req, res) => {
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});


// POST route to handle user registration
app.post('/signup', (req, res) => {
    const { name, username, email, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).send("Registration failed: Missing username or password.");
    }
    
    // --- AUTH/DB Placeholder ---
    // Here, you would typically check if the user exists and store the new user.
    console.log(`User registration attempt successful for: ${username}. Redirecting to login.`);
    // ---------------------------
    
    // CRITICAL: Always send a response/redirect
    res.redirect('/login'); 
});


app.post('/login', (req, res) => {
    // Basic placeholder login logic
    const username = req.body.username || 'Guest';
    // In a real app, you'd check credentials and assign a persistent session ID
    const userId = 'user_' + Math.random().toString(36).substring(2, 8);
    res.redirect(`/?userId=${userId}`); 
});

app.get('/logout', (req, res) => {
    // Session cleanup logic would go here
    res.redirect('/login');
});

// --- 6. SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    // Note: Authentication relies on query parameter which is weak security
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

    // A. Start Simple Game Session 
    socket.on('start_simple_session', () => {
        
        if (!flagData || flagData.length === 0) {
            console.error("FATAL ERROR: flagData is empty or not loaded. Cannot start game.");
            socket.emit('server_error', { message: "Game data is unavailable on the server. Check server logs." });
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
