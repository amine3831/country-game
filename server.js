// server.js (FINAL, UNIFIED CODE with Sign-up Message and Login Debugging)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io'); 
// NOTE: fs/promises removed as persistence is not needed for testing

const app = express();
const server = http.createServer(app);
const io = socketio(server);


// --- 2. IN-MEMORY TESTING DATABASE (STOCK VARIABLES) ---
// This array holds the users and can be added to dynamically.
let users = [
    {
        id: 'user_a1b2', 
        username: 'Player1',
        email: 'p1@test.com',
        password: 'password123', // Plain text for simple testing
        name: 'Test Player One',
        highScore: 15, // Test high score
        createdAt: new Date().toISOString()
    },
    {
        id: 'user_c3d4', 
        username: 'Player2',
        email: 'p2@test.com',
        password: 'password123', // Plain text for simple testing
        name: 'Test Player Two',
        highScore: 8,
        createdAt: new Date().toISOString()
    }
];
console.log(`✅ In-Memory Test Database initialized with ${users.length} users.`);


// --- 2.5 DATA LOADING (Flags and Groups - Unchanged) ---
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


// Signup adds user to in-memory array and prints a message.
app.post('/signup', (req, res) => {
    const { name, username, email, password } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).send("Registration failed: Missing required fields.");
    }

    // Check if username already exists
    if (users.find(u => u.username === username)) {
        return res.status(409).send("Registration failed: Username already exists.");
    }
    
    try {
        // 1. Create the new user object
        const newUser = {
            id: 'user_' + Math.random().toString(36).substring(2, 10),
            username: username,
            email: email,
            password: password, // Plain text for testing
            name: name,
            highScore: 0,
            createdAt: new Date().toISOString()
        };
        
        // 2. Add to in-memory array
        users.push(newUser);
        
        console.log(`✅ New user signed up: ${username}. Total users: ${users.length}`);
        
        // 3. Send the "Thank you" message response
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Registration Complete</title>
                <style>
                    body { font-family: sans-serif; text-align: center; margin-top: 100px; }
                    .container { padding: 40px; border: 1px solid #ccc; max-width: 400px; margin: auto; }
                    .button-link { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>🎉 Thank you for registering, ${username}!</h2>
                    <p>Your details have been saved (in memory for testing).</p>
                    <a href="/login" class="button-link">Proceed to Login</a>
                </div>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("Registration failed due to a server error.");
    }
});


// ⭐ LOGIN ROUTE WITH DEBUGGING AND .trim() FIX ⭐
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
        // Log when the username is not found
        console.log(`[LOGIN FAILED] User not found: ${username}`);
        return res.status(401).send("Login failed: Invalid username or password.");
    }
    
    // ⭐ DEBUGGING LOG: Prints the values being compared ⭐
    console.log(`[LOGIN ATTEMPT] User found: ${username}`);
    console.log(`Submitted Password: "${password}"`);
    console.log(`Stored Password:    "${user.password}"`);
    // ⭐ END DEBUGGING LOG ⭐

    // Trim both passwords to eliminate possible invisible spaces from form submission
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

    socket.on('disconnect', () => { 
        delete simpleGames[socket.id];
    });
});


// --- 7. SERVER STARTUP ---

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('--- TEST CREDENTIALS ---');
    console.log('Stock Users: Player1/password123, Player2/password123');
    console.log('------------------------');
});
