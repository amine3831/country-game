// server.js (FULL FIXED VERSION)

// --- 1. CORE IMPORTS & SERVER SETUP ---
const path = require('path');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 2. IN-MEMORY TESTING DATABASE & GAME DATA ---
let users = [];
console.log(✅ In-Memory Test Database initialized with ${users.length} users (empty).);

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
[${index + 1}] Username: ${user.username}, ID: ${user.id}, High Score: ${user.highScore}
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

// RENAMED FUNCTION: startSimpleGameRound -> startSoloRound
function startSoloRound(playerId, socket) { // ADDED socket argument
const game = simpleGames[playerId];
if (!game) {
console.error(ERROR: Game object not found for playerId: ${playerId});
return;
}

// Ensure flagData is present before proceeding  
if (!flagData || flagData.length === 0) {  
    return socket.emit('server_error', { message: "Game data unavailable." });  
}  

game.currentQuestionIndex++;  
  
// Ensure the index calculation is correct for wrapping/restarting  
const questionIndex = game.currentQuestionIndex % game.matchQuestions.length;   
const currentQuestion = game.matchQuestions[questionIndex];  
  
if (!currentQuestion || typeof currentQuestion.country !== 'string' || currentQuestion.country.length === 0) {  
    console.error("DATA ERROR: Current question object is invalid or country name is missing.");  
    return;  
}  
  
console.log(`[SOLO] Starting Round ${game.currentStreak + 1}. Flag: ${currentQuestion.country}`);  
  
const options = generateQuizOptions(currentQuestion.country);  
  
// RENAMED EVENT: simple_new_round -> solo_new_round  
io.to(playerId).emit('solo_new_round', {  
    streak: game.currentStreak,  
    highScore: game.highScore,   
    image: currentQuestion.image,  
    options: options  
});

}

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

// --- 5. EXPRESS ROUTES (UNCHANGED) ---
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
      
    // --- ADDED LOG ---  
    console.log(`✅ [SIGNUP] New user signed up: ${username} (ID: ${newUser.id}). Total users: ${users.length}`);  
      
    // Log all users after successful sign-up  
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

// Attach user/username to socket object for easy access  
socket.userId = userId;  
socket.username = username;  
  
const user = users.find(u => u.id === userId);  
if (!user) {  
    socket.emit('unauthorized_access');  
    return socket.disconnect(true);  
}  
  
username = user.username;  
console.log(`[SOCKET] User connected: ${username} (ID: ${userId})`);  
socket.emit('auth_successful', { username: username });  

// --- SIMPLE GAME HANDLERS (FIXED AND LOGGED) ---  
// RENAMED EVENT: start_simple_session -> start_solo_game  
socket.on('start_solo_game', () => {   
    const logUsername = socket.username || 'Unknown Player';  
    console.log(`[SOLO GAME] Player ${logUsername} started a new solo game.`); // ADDED LOG  

    if (!flagData || flagData.length === 0) return socket.emit('server_error', { message: "Game data is unavailable." });  

    if (simpleGames[socket.id]) delete simpleGames[socket.id];   

    const shuffledQuestions = shuffleArray([...flagData]);   
      
    simpleGames[socket.id] = {  
        id: generateMatchId(),   
        playerId: socket.id,   
        currentStreak: 0,  
        highScore: user.highScore || 0,   
        matchQuestions: shuffledQuestions,   
        currentQuestionIndex: -1,  
    };  
      
    startSoloRound(socket.id, socket); // Updated function name and added socket  
});  

// RENAMED EVENT: submit_simple_answer -> submit_solo_answer  
socket.on('submit_solo_answer', (data) => {   
    // RENAMED FUNCTION: startSimpleGameRound -> startSoloRound  
    const game = simpleGames[socket.id];  
    if (!game || game.currentQuestionIndex === -1) return;  

    const questionIndex = game.currentQuestionIndex % game.matchQuestions.length;  
    const question = game.matchQuestions[questionIndex];  
    const isCorrect = data.answer === question.country;  
      
    // RENAMED EVENT: simple_game_feedback -> solo_feedback  
    socket.emit('solo_feedback', {  
        isCorrect: isCorrect,  
        correctAnswer: question.country  
    });  

    if (isCorrect) {  
        game.currentStreak++;  
        startSoloRound(socket.id, socket); // Updated function name and added socket  
          
    } else {  
        const finalStreak = game.currentStreak;  
        if (finalStreak > user.highScore) {   
            user.highScore = finalStreak;   
            game.highScore = finalStreak;  
            console.log(`⭐ High score updated for ${user.username}: ${finalStreak}`);  
        }  
          
        // RENAMED EVENT: simple_game_over -> solo_game_over  
        socket.emit('solo_game_over', {  
            score: finalStreak, // Updated property name to match client  
            highScore: user.highScore  
        });  
    }  
});  

// --- MULTIPLAYER HANDLERS (STABILITY FIX) ---  
// ... (Multiplayer handlers remain here) ...  
socket.on('start_multiplayer', () => {  
    // ... (rest of start_multiplayer logic) ...  
});  

socket.on('submit_multiplayer_answer', (data) => {  
    // ... (rest of submit_multiplayer_answer logic) ...  
});  

// --- DISCONNECT HANDLER (UNCHANGED) ---  
socket.on('disconnect', () => {   
    delete simpleGames[socket.id];  
      
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

// --- 7. SERVER STARTUP (UNCHANGED) ---
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
console.log(Server running on port ${PORT});
console.log('--- DYNAMIC TESTING READY ---');
console.log('1. Go to /signup to create an account.');
console.log('2. Immediately go to /login to test authentication.');
});