// server_game_modes.js (UPDATE EXISTING FILE)
const path = require('path');

// ... (Existing imports and setup) ...

// Game state variables
let waitingPlayer = null; 
const activeMatches = {};  
const simpleGames = {}; // 💡 NEW: Track active simple games { socketId: { matchId, currentStreak, highScore, matchQuestions, ... } }

// ... (Existing Express Middleware) ...

// --- EXPRESS ROUTES (Authentication & Serving HTML) ---

// 1. Route for the main game page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 💡 NEW ROUTE: Route for the Simple Game page
app.get('/simple_game', (req, res) => {
    res.sendFile(path.join(__dirname, 'simple_game.html'));
});

// ... (Existing routes: /signup, /login, /logout) ...

// --- UTILITY FUNCTIONS (Assume your existing implementation is here) ---
function shuffleArray(array) { /* ... */ return array; }
function generateMatchId() { /* ... */ return Math.random().toString(36).substring(2, 8); }
function selectUniqueRandom(sourceArr, count, excludeArr = []) { /* ... */ return []; }
function generateQuizOptions(correctCountry) { /* ... */ return []; } 

// --- NEW FUNCTION: Simple Game Round Starter ---
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
// ---------------------------------------------


// --- 4. SOCKET.IO EVENT HANDLERS (UPDATED LOGIC) ---

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    
    // ... (Existing Auth and connection success logic) ...
    if (!userId) { /* ... */ }
    // ... (rest of auth) ...
    
    console.log(`Authenticated user connected: ${username} (ID: ${userId})`);
    socket.emit('auth_successful', { username: username });
    
    // --- NEW: Simple Game Request Handlers ---

    // A. Start Simple Game Session (triggered when user lands on simple_game.html)
    socket.on('start_simple_session', () => {
        // 1. Check if a session already exists (to prevent resetting game on page refresh)
        if (simpleGames[socket.id]) {
            // Restart game for clean state if refreshing
            delete simpleGames[socket.id]; 
        }

        // 2. Prepare the questions
        const shuffledQuestions = shuffleArray([...flagData]); 
        
        // 3. Create the game object
        simpleGames[socket.id] = {
            id: generateMatchId(), 
            playerId: socket.id, 
            currentStreak: 0,
            highScore: 0, // In a real app, this would be loaded from a database
            matchQuestions: shuffledQuestions, 
            currentQuestionIndex: -1,
        };
        
        console.log(`Simple Game session started for user ${socket.id}.`);
        
        // 4. Start the first round
        startSimpleGameRound(socket.id); 
    });


    // B. Simple Game Answer Submission Handler
    socket.on('submit_simple_answer', (data) => {
        const game = simpleGames[socket.id];
        if (!game || game.currentQuestionIndex === -1) return; // Game not initialized

        const questionIndex = game.currentQuestionIndex % game.matchQuestions.length;
        const question = game.matchQuestions[questionIndex];
        const isCorrect = data.answer === question.country;
        
        // 1. Send feedback immediately
        socket.emit('simple_game_feedback', {
            isCorrect: isCorrect,
            correctAnswer: question.country
        });

        if (isCorrect) {
            // Increase streak and proceed
            game.currentStreak++;
            startSimpleGameRound(socket.id);
            
        } else {
            // Game Over
            const finalStreak = game.currentStreak;
            
            // Update high score
            if (finalStreak > game.highScore) {
                game.highScore = finalStreak;
            }
            
            // Notify client of game over
            socket.emit('simple_game_over', {
                finalStreak: finalStreak,
                highScore: game.highScore
            });
            
            // Clean up the game (optional, keeping it allows tracking high score for session)
            // delete simpleGames[socket.id]; 
        }
    });
    // -------------------------------------------------------------


    // ... (Existing multiplayer match logic remains below) ...
    socket.on('request_multiplayer_match', () => { /* ... */ });
    socket.on('submit_answer', (data) => { /* ... */ });
    socket.on('disconnect', () => { 
        // 💡 Cleanup simple games on disconnect
        delete simpleGames[socket.id];
        // ... (rest of disconnect logic) ...
    });
    // ... (rest of the file: endGame, flagData, etc.) ...
});
