// server.js (Section 6: SOCKET.IO EVENT HANDLERS)

// ... (existing code up to socket.emit('auth_successful', ...) )

    // --- MULTIPLAYER HANDLERS (New/Corrected Logic) ---

    socket.on('start_multiplayer', () => {
        if (!flagData || flagData.length === 0) {
            return socket.emit('server_error', { message: "Game data is unavailable on the server." });
        }
        
        console.log(`[MULTIPLAYER] ${username} (ID: ${socket.id}) is attempting to start a match.`);

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Player 2 found: Start the Match
            
            const player1Socket = io.sockets.sockets.get(waitingPlayer.id);
            const player2Socket = socket;
            
            if (!player1Socket) {
                console.error(`ERROR: Waiting player socket (${waitingPlayer.id}) not found. Resetting.`);
                waitingPlayer = { id: socket.id, username: username };
                return socket.emit('searching');
            }

            const matchId = generateMatchId();
            const matchQuestions = shuffleArray([...flagData]).slice(0, MAX_ROUNDS); 

            const match = {
                id: matchId,
                players: {
                    [waitingPlayer.id]: { username: waitingPlayer.username, score: 0, socket: player1Socket },
                    [socket.id]: { username: username, score: 0, socket: player2Socket },
                },
                questionIndex: -1,
                questions: matchQuestions,
                currentFlag: null,
                roundTimer: null,
            };
            
            activeMatches[matchId] = match;

            // Clear the waiting list
            waitingPlayer = null;

            // Group the two sockets into a single room for easy communication
            player1Socket.join(matchId);
            player2Socket.join(matchId);

            console.log(`✅ MATCH STARTED: ${waitingPlayer.username} vs ${username} (ID: ${matchId})`);
            
            // Notify both players the match has started
            io.to(matchId).emit('match_started', {
                matchId: matchId,
                opponent: socket.id === player1Socket.id ? username : waitingPlayer.username,
                // Include player data so the client knows their role and opponent's username
                playerMap: {
                    [player1Socket.id]: waitingPlayer.username,
                    [player2Socket.id]: username
                }
            });

            // Start the first round after a brief delay
            setTimeout(() => {
                startMultiplayerRound(matchId);
            }, 1000);

        } else {
            // Player 1: Register as waiting
            waitingPlayer = { id: socket.id, username: username };
            console.log(`[MULTIPLAYER] ${username} is now waiting for an opponent.`);
            socket.emit('searching');
        }
    });

    // Handle incoming answers for multiplayer
    socket.on('submit_multiplayer_answer', (data) => {
        const { matchId, answer } = data;
        const match = activeMatches[matchId];

        if (!match || match.questionIndex === -1) return;
        
        const playerId = socket.id;
        
        // Prevent double answering in the same round
        if (match.players[playerId].answeredThisRound) return;

        const currentQuestion = match.questions[match.questionIndex];
        const isCorrect = answer === currentQuestion.country;
        
        match.players[playerId].answeredThisRound = true;

        if (isCorrect) {
            match.players[playerId].score += 1;
        }

        console.log(`[MATCH ${matchId}] ${match.players[playerId].username} answered. Correct: ${isCorrect}. Score: ${match.players[playerId].score}`);

        // Send feedback only to the player who answered
        socket.emit('multiplayer_feedback', { isCorrect: isCorrect, correctAnswer: currentQuestion.country });

        // Check if all players have answered
        const allAnswered = Object.values(match.players).every(p => p.answeredThisRound);

        if (allAnswered) {
            // Stop the timer immediately
            clearTimeout(match.roundTimer);
            startNextMultiplayerRound(matchId);
        }
    });


    // --- DISCONNECT HANDLER (Crucial for clearing state) ---
    socket.on('disconnect', () => { 
        // 1. Clean up Simple Game state
        delete simpleGames[socket.id];
        
        // 2. Clean up Multiplayer state
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            console.log(`[MULTIPLAYER] Cleared waiting player: ${username}`);
            waitingPlayer = null;
        }

        // 3. Check for active match disruption
        for (const matchId in activeMatches) {
            const match = activeMatches[matchId];
            if (match.players[socket.id]) {
                console.log(`[MATCH ${matchId}] Player ${username} disconnected. Ending match.`);
                
                // Determine the winner/loser and notify the remaining player
                const opponentId = Object.keys(match.players).find(id => id !== socket.id);
                if (opponentId) {
                    const opponentSocket = match.players[opponentId].socket;
                    if (opponentSocket) {
                         opponentSocket.emit('match_ended_opponent_disconnect', {
                            winner: match.players[opponentId].username,
                            finalScore: match.players[opponentId].score 
                         });
                    }
                }
                
                delete activeMatches[matchId];
                break;
            }
        }
    });
});
