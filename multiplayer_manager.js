// multiplayer_manager.js

// --- 1. GLOBAL MULTIPLAYER STATE (from server.js) ---
let waitingPlayer = null; 
const activeMatches = {};  
const MAX_ROUNDS = 10;
const ROUND_TIME_LIMIT_MS = 10000;

// You'll need to pass these utility functions or import them. 
// For simplicity, let's assume you pass them via the initialization function.
let flagData = []; 
let CONFUSION_GROUPS_MAP = {};

// Helper functions (e.g., generateMatchId, generateQuizOptions, shuffleArray) 
// need to be defined or imported here. For now, assume they are passed in.

// --- 2. GAME LOGIC UTILITIES (Must be defined or imported) ---
// Since these are complex, we'll assume they are defined outside this snippet
// or passed in (like generateQuizOptions, endMatch, startMultiplayerRound, etc.)
// For simplicity, we'll keep the core handler function clean.

// --- 3. THE HANDLER FUNCTION ---
// This function takes the Socket.IO instance (io) and the connected socket
// along with necessary game data and utilities.
function attachMultiplayerHandlers(io, socket, user, gameData, utils) {
    const { userId, username } = user;
    ({ flagData, CONFUSION_GROUPS_MAP } = gameData);
    const { generateQuizOptions, startMultiplayerRound, endMatch, startNextMultiplayerRound } = utils;

    // --- MULTIPLAYER HANDLERS (Copied from server.js) ---
    
    socket.on('start_multiplayer', () => {
        if (!flagData || flagData.length === 0) {
            return socket.emit('server_error', { message: "Game data unavailable." });
        }

        console.log(`[MULTIPLAYER] ${username} (ID: ${userId}) wants to start.`);

        // ... (Matchmaking logic remains the same, using waitingPlayer and activeMatches) ...
        // NOTE: The logic must be updated to use the variables/functions 
        // passed into this handler or defined in this file.

        if (waitingPlayer && waitingPlayer.socketId !== socket.id) { 
            const player1 = waitingPlayer;
            const player1Socket = io.sockets.sockets.get(player1.socketId);
            
            // ... (Match creation logic using 'generateMatchId', 'shuffleArray', etc.) ...
            
            // Example of match creation:
            const matchId = utils.generateMatchId(); 
            const matchQuestions = utils.shuffleArray([...flagData]).slice(0, MAX_ROUNDS);

            activeMatches[matchId] = {
                id: matchId,
                // ... (rest of match object) ...
                questions: matchQuestions,
            };

            // ... (rest of match creation, joining rooms, starting first round) ...
            
            waitingPlayer = null; 
            
            console.log(`✅ MATCH STARTED: ${player1.username} vs ${username} (ID: ${matchId})`);
            // ... (io.to(matchId).emit('match_started', ...)) ...

            setTimeout(() => startMultiplayerRound(matchId), 1000);

        } else {
            // Player 1: Register as waiting
            waitingPlayer = { userId, socketId: socket.id, username };
            console.log(`🔎 [MULTIPLAYER] ${username} (ID: ${userId}) is now SEARCHING for an opponent.`);
            socket.emit('searching');
        }
    });

    socket.on('submit_multiplayer_answer', (data) => {
        // ... (Logic for handling answer submission and calling startNextMultiplayerRound) ...
    });
    
    // ... (Add disconnect logic for cleaning up waitingPlayer and activeMatches) ...
}

module.exports = {
    attachMultiplayerHandlers,
    activeMatches, // Export for debug or other server functions
    waitingPlayer // Export for debug or other server functions
};
      
