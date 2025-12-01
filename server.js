// --- 1. SETUP & CONFIGURATION ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const bodyParser = require('body-parser'); // To handle form data
// Removed: const bcrypt = require('bcrypt');

// --- Load the Master Confusion Map from the 'groups.js' file ---
const CONFUSION_GROUPS_MAP = require('./groups.js'); 
// -------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS for Render compatibility
const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from your Render URL
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;
const TOTAL_ROUNDS = 3; 

// --- IN-MEMORY USER DATABASE (NO HASHING) ---
// Structure: { id: number, username: string, email: string, password: string }
const users = []; 
const activeSessions = {}; // Stores socketId -> userId mapping

// Game state variables
let waitingPlayer = null; 
const activeMatches = {};  

// --- Express Middleware ---
app.use(bodyParser.urlencoded({ extended: true })); // Middleware to parse form data
app.use(express.static(path.join(__dirname))); 

// --- NEW EXPRESS ROUTES (Authentication & Serving HTML) ---

// 1. Route for the main game page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Route to serve the signup form
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// 3. Route to serve the login form
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 4. Route to handle signup form submission (POST) - ***SIMPLE PASSWORD STORAGE***
app.post('/signup', (req, res) => {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
        return res.status(400).send('All fields are required.');
    }

    const existingUser = users.find(u => u.username === username || u.email === email);
    if (existingUser) {
        return res.status(409).send('Username or Email already taken.');
    }

    try {
        // ⚠️ INSECURE: Storing password as plain text for simplicity
        const newUser = {
            id: users.length + 1,
            name,
            username,
            email,
            password: password, // Storing plain text password
            createdAt: new Date()
        };
        
        users.push(newUser);
        
        console.log(`New user registered: ${username}`);
        res.redirect('/login'); 
        
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).send('Server error during registration.');
    }
});

// 5. Route to handle login form submission (POST) - ***SIMPLE PASSWORD CHECK***
app.post('/login', (req, res) => {
    const { usernameOrEmail, password } = req.body;

    // A. Find the user by username or email
    const user = users.find(u => u.username === usernameOrEmail || u.email === usernameOrEmail);
    
    if (!user) {
        return res.status(401).send('Invalid credentials.');
    }

    try {
        // B. SIMPLE PASSWORD CHECK (String comparison)
        if (user.password === password) {
            console.log(`User logged in: ${user.username}`);
            
            // C. Authentication successful. Redirect to the game page including the userId in the URL query
            res.redirect(`/?userId=${user.id}`); 
        } else {
            res.status(401).send('Invalid credentials.');
        }

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Server error during login.');
    }
});

// 6. Logout Route 
app.get('/logout', (req, res) => {
    res.redirect('/login');
});


// --- 2. UTILITY FUNCTIONS (Your existing code) ---

function shuffleArray(array) { /* ... implementation ... */
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateMatchId() { /* ... implementation ... */
    return Math.random().toString(36).substring(2, 8);
}


function selectUniqueRandom(sourceArr, count, excludeArr = []) { /* ... implementation ... */
    const selectionPool = sourceArr.filter(item => !excludeArr.includes(item));
    const selected = [];
    
    const maxSelect = Math.min(count, selectionPool.length); 

    while (selected.length < maxSelect) {
        const randomIndex = Math.floor(Math.random() * selectionPool.length);
        const item = selectionPool.splice(randomIndex, 1)[0]; 
        selected.push(item);
    }
    return selected;
}

function generateQuizOptions(correctCountry) { /* ... implementation ... */
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
        console.error(`Error generating options for ${correctCountry}. Generated ${finalOptions.length} options. Using random fallback.`);
        const backupDistractors = selectUniqueRandom(ALL_COUNTRIES_NAMES, 3, [correctCountry]);
        return shuffleArray([correctCountry, ...backupDistractors]);
    }
    
    return shuffleArray(finalOptions);
}

// --- 3. MATCH & GAME MANAGEMENT (Your existing code) ---

function createNewMatch(p1Id, p2Id, matchId) { /* ... implementation ... */
    const shuffledQuestions = shuffleArray([...flagData]); 
    activeMatches[matchId] = {
        id: matchId, p1Id: p1Id, p2Id: p2Id, p1Score: 0, p2Score: 0,
        currentRound: 0, matchQuestions: shuffledQuestions, roundAnswers: { p1: null, p2: null }, 
        roundStartTime: 0 
    };
    io.to(p1Id).emit('match_found', { matchId, isP1: true });
    io.to(p2Id).emit('match_found', { matchId, isP1: false });
    console.log(`Match ${matchId} created between ${p1Id} and ${p2Id}.`);
    startGameRound(matchId, 1);
}

function startGameRound(matchId, roundNumber) { /* ... implementation ... */
    const match = activeMatches[matchId];
    if (!match) return;

    match.currentRound = roundNumber;
    match.roundAnswers = { p1: null, p2: null }; 
    match.roundStartTime = Date.now(); 

    const questionIndex = roundNumber - 1;
    const currentQuestion = match.matchQuestions[questionIndex];
    
    if (!currentQuestion) {
        return calculateScores(matchId, true); 
    }

    const { country, image } = currentQuestion;
    const options = generateQuizOptions(country);

    io.to(matchId).emit('new_round', {
        round: roundNumber, image: image, options: options 
    });

    console.log(`Match ${matchId}: Starting Round ${roundNumber}. Correct answer: ${country}`);
}

function calculateScores(matchId, isFinalCheck = false) { /* ... implementation ... */
    const match = activeMatches[matchId];
    if (!match) return;

    const { p1Id, p2Id, roundAnswers, matchQuestions, currentRound, roundStartTime } = match;
    const currentQuestion = matchQuestions[currentRound - 1];
    const correctAnswer = currentQuestion.country; 

    const p1Answer = roundAnswers.p1;
    const p2Answer = roundAnswers.p2;
    
    if ((p1Answer && p2Answer) || isFinalCheck) {
        
        let winnerId = null;
        let p1Correct = p1Answer && p1Answer.answer === correctAnswer;
        let p2Correct = p2Answer && p2Answer.answer === correctAnswer;

        if (p1Correct && p2Correct) {
            if (p1Answer.time < p2Answer.time) {
                match.p1Score++;
                winnerId = p1Id;
            } else if (p2Answer.time < p1Answer.time) {
                match.p2Score++;
                winnerId = p2Id;
            }
        } else if (p1Correct) {
            match.p1Score++;
            winnerId = p1Id;
        } else if (p2Correct) {
            match.p2Score++;
            winnerId = p2Id;
        }

        const p1TimeElapsed = p1Answer ? (p1Answer.time - roundStartTime) / 1000 : Infinity; 
        const p2TimeElapsed = p2Answer ? (p2Answer.time - roundStartTime) / 1000 : Infinity;
        
        io.to(matchId).emit('round_results', {
            correctAnswer: correctAnswer, p1Score: match.p1Score, p2Score: match.p2Score,
            p1Time: p1TimeElapsed, p2Time: p2TimeElapsed, winnerId: winnerId
        });
        
        console.log(`Match ${matchId} Round ${currentRound} result: P1(${match.p1Score}) vs P2(${match.p2Score}). Winner: ${winnerId ? winnerId : 'None'}`);

        let nextRound = currentRound + 1;
        
        if (currentRound >= TOTAL_ROUNDS) {
            if (match.p1Score !== match.p2Score) {
                return endGame(matchId);
            }
        }

        if (nextRound > matchQuestions.length) {
            return endGame(matchId);
        }

        setTimeout(() => {
            startGameRound(matchId, nextRound);
        }, 3000); 
    }
}

function endGame(matchId) { /* ... implementation ... */
    const match = activeMatches[matchId];
    if (!match) return;

    let winnerId = null;
    if (match.p1Score > match.p2Score) {
        winnerId = match.p1Id;
    } else if (match.p2Score > match.p1Score) {
        winnerId = match.p2Id;
    }

    io.to(matchId).emit('game_over', {
        winner: winnerId, p1Score: match.p1Score, p2Score: match.p2Score
    });
    
    console.log(`Match ${matchId} ended. Winner: ${winnerId || 'Draw'}`);

    io.sockets.sockets.get(match.p1Id)?.leave(matchId);
    io.sockets.sockets.get(match.p2Id)?.leave(matchId);
    delete activeMatches[matchId];
}

// --- 4. SOCKET.IO EVENT HANDLERS (Your existing code) ---

io.on('connection', (socket) => {
    // Get the userId from the handshake query parameters
    const userId = socket.handshake.query.userId;
    
    if (!userId) {
        console.log(`Unauthenticated socket connection rejected: ${socket.id}`);
        return socket.emit('unauthorized_access'); 
    }

    // Authenticated user connected
    activeSessions[socket.id] = parseInt(userId);
    const user = users.find(u => u.id === parseInt(userId));
    const username = user ? user.username : 'Player';
    
    console.log(`Authenticated user connected: ${username} (ID: ${userId})`);
    socket.emit('auth_successful', { username: username });
    
    // --- Matchmaking Logic ---
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
        const matchId = generateMatchId();
        
        waitingPlayer.join(matchId);
        socket.join(matchId);

        createNewMatch(waitingPlayer.id, socket.id, matchId);
        waitingPlayer = null; 
        
    } else {
        waitingPlayer = socket;
        socket.emit('waiting_for_opponent');
    }

    // --- Player Answer Submission ---
    socket.on('submit_answer', (data) => { /* ... implementation ... */
        const match = activeMatches[data.matchId];
        if (!match) return;

        const receiveTime = Date.now(); 
        const answerData = { answer: data.answer, time: receiveTime };

        const isP1 = socket.id === match.p1Id;
        const timeElapsed = (receiveTime - match.roundStartTime) / 1000;
        
        const opponentId = isP1 ? match.p2Id : match.p1Id;
        
        let answerRecorded = false;

        if (isP1 && !match.roundAnswers.p1) {
            match.roundAnswers.p1 = answerData;
            answerRecorded = true;
        } else if (!isP1 && !match.roundAnswers.p2) {
            match.roundAnswers.p2 = answerData;
            answerRecorded = true;
        }

        if (answerRecorded) {
            socket.emit('answer_registered', { timeElapsed: timeElapsed, isOpponent: false });
            io.to(opponentId).emit('answer_registered', { timeElapsed: timeElapsed, isOpponent: true });
        }
        
        if (match.roundAnswers.p1 && match.roundAnswers.p2) {
            calculateScores(data.matchId);
        }
    });

    // --- Disconnect Handling ---
    socket.on('disconnect', () => { /* ... implementation ... */
        console.log(`User disconnected: ${socket.id}`);

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null; 
        } else {
            for (const matchId in activeMatches) {
                const match = activeMatches[matchId];
                if (match.p1Id === socket.id || match.p2Id === socket.id) {
                    
                    const opponentId = (match.p1Id === socket.id) ? match.p2Id : match.p1Id;
                    
                    io.to(opponentId).emit('opponent_disconnected', 'Your opponent disconnected! The game has ended.');
                    
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
    console.log(`Signup Page: http://localhost:${PORT}/signup`);
    console.log(`Login Page: http://localhost:${PORT}/login`);
});


// --- 6. FLAG DATASET (50 Flags) ---
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
