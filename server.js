// server.js (FINAL, UNIFIED CODE with Simple Plaintext JSON Database and Stability Fixes)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io'); 
const fs = require('fs/promises'); // Use fs/promises for async file operations

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const DB_FILE = path.join(__dirname, 'db.json');

// --- 2. DATA LOADING & DB MANAGEMENT ---
let flagData = []; 
let CONFUSION_GROUPS_MAP = {}; 
let users = []; // In-memory cache for user data

/** Reads user data from db.json */
async function loadUsers() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        users = JSON.parse(data);
        console.log(`✅ Database loaded: ${users.length} users.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn("⚠️ WARNING: db.json file not found. Starting with an empty database.");
            users = [];
            // Attempt to create the file so subsequent writes work
            await saveUsers(); 
        } else {
            console.error("❌ CRITICAL ERROR: Failed to load db.json:", error.message);
        }
    }
}

/** Writes current in-memory user data back to db.json (ENHANCED ERROR LOGGING) */
async function saveUsers() {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(users, null, 2));
        console.log(`✅ Database saved successfully to ${DB_FILE}. Current user count: ${users.length}`);
    } catch (error) {
        // Log the exact error if saving fails (e.g., permission issue)
        console.error("❌ CRITICAL ERROR: Failed to save db.json. Check file permissions or disk space:", error.message);
        // Re-throw the error so the calling route (like /signup) can handle the failure
        throw new Error("Failed to save user data."); 
    }
}

// Data loading for flags and groups (unchanged)
try {
    const rawFlagData = require('./flag_data.json'); 
    flagData = rawFlagData.map(item => ({
        ...item,
        country: item.correctAnswer, 
        image: item.image, 
    }));
    
    CONFUSION_GROUPS_MAP = require('./groups');
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

// --- 4. UTILITY FUNCTIONS (unchanged) ---

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


// ⭐ REFINED: POST route to handle user registration and ensure persistence
app.post('/signup', async (req, res) => {
    const { name, username, email, password } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).send("Registration failed: Missing required fields.");
    }

    // Check if username or email already exists (This check uses in-memory data, which is why 
    // it was correctly reporting "exists" even when the save failed previously)
    if (users.find(u => u.username === username)) {
        return res.status(409).send("Registration failed: Username already exists.");
    }
    if (users.find(u => u.email === email)) {
        return res.status(409).send("Registration failed: Email already exists.");
    }

    const newUser = {
        id: 'user_' + Math.random().toString(36).substring(2, 10),
        username: username,
        email: email,
        password: password, // Plain text as requested
        name: name,
        highScore: 0,
        createdAt: new Date().toISOString()
    };
    
    // Add to in-memory array first
    users.push(newUser);
    
    try {
        // ⭐ CRITICAL FIX: Ensure the save operation completes before moving on.
        await saveUsers(); 
        
        console.log(`✅ New user signed up: ${username}. Total users: ${users.length}`);
        res.redirect('/login'); 
        
    } catch (error) {
        // If saveUsers() failed, we must remove the user from the in-memory array
        // to keep memory consistent with the file, allowing the user to try again.
        users.pop(); 
        console.error("Signup persistence failed:", error.message); 
        res.status(500).send("Registration failed: Server error saving data. Please check logs for file permission issues.");
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
        return res.status(401).send("Login failed: Invalid username or password.");
    }

    if (password === user.password) {
        // Authentication successful
        const userId = user.id;
        
        console.log(`✅ User logged in: ${username}`);
        
        res.redirect(`/?userId=${userId}&username=${username}`); 
            
    } else {
        // Password mismatch
        res.status(401).send("Login failed: Invalid username or password.");
    }
});


app.get('/logout', (req, res) => {
    res.redirect('/login');
});

// --- 6. SOCKET.IO EVENT HANDLERS (unchanged) ---

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

    
    // --- SIMPLE GAME HANDLERS (unchanged) ---

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
            
            if (finalStreak > game.highScore) {
                user.highScore = finalStreak; 
                game.highScore = finalStreak;
                // CRITICAL: Ensure we save the updated high score
                saveUsers(); 
            }
            
            socket.emit('simple_game_over', {
                finalStreak: finalStreak,
                highScore: game.highScore
            });
        }
    });

    socket.on('disconnect', () => { 
        delete simpleGames[socket.id];
    });
});


// --- 7. SERVER STARTUP ---

const PORT = process.env.PORT || 3000;

// CRITICAL: Load users before starting the server
loadUsers().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
