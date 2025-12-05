// main_game_logic.js - Handles the Multiplayer Match Flow and UI

// --- 1. GLOBAL GAME STATE VARIABLES ---
let currentMatchId = null;
let isAnswered = false; 
let roundStartTime = 0; 
let myScore = 0;
let opponentScore = 0;
let isP1 = false; 
let opponentUsername = 'Opponent'; // New variable for easy access

// --- 2. ELEMENT REFERENCES ---
// These declarations must remain global so they are accessible by the functions below
const gameContainerEl = document.getElementById('game-area'); // ⬅️ CRITICAL FIX: References 'game-area'
const statusEl = document.getElementById('status');
const roundDisplayEl = document.getElementById('round-display');
const flagImageEl = document.getElementById('current-flag');
const optionsContainerEl = document.getElementById('options-container');
const resultMessageEl = document.getElementById('result-message');
const playerScoreEl = document.getElementById('player-score');
const opponentScoreEl = document.getElementById('opponent-score');
const playerTimeEl = document.getElementById('player-time');
const opponentTimeEl = document.getElementById('opponent-time');
const scoreboardContainerEl = document.getElementById('scoreboard-container');


// --- 3. EXPORTED INITIALIZATION FUNCTION ---

/**
 * Attaches all Socket.io listeners needed for the multiplayer game flow.
 * Must be called once after a successful socket connection is established.
 * @param {Socket} socket The established Socket.io connection object.
 */
window.initializeGameLogic = function(socket) {
    console.log('Game logic initializing listeners...');

    // Listener 1: Match starts
    socket.on('match_started', (data) => {
        console.log(`[CLIENT] Match started! ID: ${data.matchId}`);

        // --- 3.1. UPDATE GAME STATE ---
        currentMatchId = data.matchId;
        isP1 = data.isP1; // True if this player is P1
        opponentUsername = data.opponentUsername; // Store opponent's name

        // --- 3.2. SHOW GAME UI & HIDE STATUS ---
        
        // CRITICAL FIX: Ensure all individual game elements are displayed
        roundDisplayEl.style.display = 'block'; 
        flagImageEl.style.display = 'block'; 
        optionsContainerEl.style.display = 'flex';
        scoreboardContainerEl.style.display = 'flex'; // Show the scoreboard
        
        statusEl.style.display = 'none'; // Hide the "Searching for opponent..." message

        // Update Opponent's name in the scoreboard label
        const opponentLabelEl = document.getElementById('opponent-score-container').querySelector('.label');
        if (opponentLabelEl) {
             opponentLabelEl.textContent = opponentUsername.toUpperCase();
        }

        // --- 3.3. START THE FIRST ROUND ---
        handleNewRound(data.initialRound, isP1, socket);
    });

    // Listener 2: New Round starts
    socket.on('new_round', (roundData) => {
        console.log(`[CLIENT] Starting Round ${roundData.roundNumber}`);
        handleNewRound(roundData, isP1, socket);
    });
    
    // Listener 3: Opponent has answered (UI update)
    socket.on('opponent_answered', (data) => {
        console.log(`[CLIENT] Opponent (${data.opponentUsername}) answered!`);
        opponentTimeEl.textContent = `${data.opponentUsername.toUpperCase()}: Answered!`;
    });

    // Listener 4: Round results are in
    socket.on('round_result', (data) => {
        console.log(`[CLIENT] Round ${data.roundNumber} Result Received.`);
        
        const myScoreUpdate = isP1 ? data.player1Score : data.player2Score;
        const opponentScoreUpdate = isP1 ? data.player2Score : data.player1Score;
        
        const myTime = isP1 ? data.player1Time : data.player2Time;
        const oppTime = isP1 ? data.player2Time : data.player1Time;
        
        const myCorrect = isP1 ? data.player1Correct : data.player2Correct;
        const oppCorrect = isP1 ? data.player2Correct : data.player1Correct;
        
        // Update total scores
        myScore = myScoreUpdate;
        opponentScore = opponentScoreUpdate;
        playerScoreEl.textContent = myScore;
        opponentScoreEl.textContent = opponentScore;
        
        // Display correctness and time
        resultMessageEl.textContent = `Correct Answer: ${data.correctAnswer}`;
        resultMessageEl.style.color = getCssVar('--success-color');
        
        // Time Display
        playerTimeEl.textContent = `YOU: ${myTime.toFixed(2)}s (${myCorrect ? '✅' : '❌'})`;
        opponentTimeEl.textContent = `${opponentUsername.toUpperCase()}: ${oppTime.toFixed(2)}s (${oppCorrect ? '✅' : '❌'})`;

        // Highlight options based on result
        optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
            const country = btn.getAttribute('data-country');
            btn.disabled = true; // Keep all disabled
            
            // Highlight the correct answer
            if (country === data.correctAnswer) {
                btn.classList.remove('selected');
                btn.classList.add('correct');
            } else if (btn.classList.contains('selected')) {
                // Highlight my incorrect answer
                btn.classList.add('incorrect');
            }
        });
        
        // Wait 3 seconds before the next round event (which is handled by the server)
    });

    // Listener 5: Match ends normally
    socket.on('match_ended', (data) => {
        console.log(`[CLIENT] Match ended.`);
        resetUI(false); // Clear game elements
        
        const finalWinner = data.winner;
        const isTie = data.finalScore1 === data.finalScore2;
        
        if (isTie) {
            statusEl.textContent = `🤝 Match ended in a DRAW! Final Score: ${data.finalScore1} - ${data.finalScore2}`;
        } else if (finalWinner === 'Draw') { // Fallback check, though handled by score comparison above
             statusEl.textContent = `🤝 Match ended in a DRAW! Final Score: ${data.finalScore1} - ${data.finalScore2}`;
        } else {
             statusEl.textContent = `🏆 MATCH OVER! ${finalWinner} wins! Final Score: ${data.finalScore1} - ${data.finalScore2}`;
        }
        
        statusEl.style.color = getCssVar('--primary-color');
        statusEl.style.display = 'block';

        setTimeout(() => {
            statusEl.textContent += ' Click here to choose a new game mode!';
            statusEl.style.cursor = 'pointer';
            statusEl.onclick = () => window.location.reload(); 
        }, 5000);
    });

    // Listener 6: Match ends due to opponent disconnect
    socket.on('match_ended_opponent_disconnect', (data) => { 
        console.log(`[CLIENT] Opponent disconnected.`);
        resetUI(false);
        statusEl.textContent = `🚨 Opponent disconnected! You win by forfeit.`;
        statusEl.style.color = getCssVar('--error-color');
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.textContent += ' Click here to choose a new game mode!';
            statusEl.style.cursor = 'pointer';
            statusEl.onclick = () => window.location.reload(); 
        }, 3000);
    });
};


// --- 4. NEW ROUND LOGIC ---

/**
 * Sets up the UI for a new quiz round.
 * @param {object} roundData - Data for the current round (flagImage, options, roundNumber).
 * @param {boolean} isPlayer1 - True if the current user is P1.
 * @param {Socket} socket - The active Socket.io connection.
 */
function handleNewRound(roundData, isPlayer1, socket) {
    if (!currentMatchId) return;

    // Reset state and UI
    resetUI(); 
    roundStartTime = Date.now();
    isAnswered = false; // Reset answer status for the new round
    
    // Update player roles/status
    const role = isPlayer1 ? 'P1 (Blue)' : 'P2 (Red)';
    roundDisplayEl.textContent = `Round ${roundData.roundNumber} / 5 | Playing as ${role}`;
    
    // Display flag
    flagImageEl.src = roundData.flagImage;
    
    // Build options
    roundData.options.forEach(country => {
        const button = document.createElement('button');
        button.className = 'mode-button option-button';
        button.textContent = country;
        button.setAttribute('data-country', country);
        
        // Attach click handler
        button.addEventListener('click', () => {
            handleAnswer(country, button, socket);
        });
        
        optionsContainerEl.appendChild(button);
    });
}


// --- 5. USER INPUT HANDLER (ADJUSTED TO ACCEPT SOCKET) ---

/**
 * Handles the player's answer selection and emits it to the server.
 * @param {string} answer - The country name selected.
 * @param {HTMLElement} selectedButton - The button element clicked.
 * @param {Socket} socket - The active Socket.io connection.
 */
function handleAnswer(answer, selectedButton, socket) {
    if (isAnswered || !currentMatchId) return;
    
    isAnswered = true;
    const answerTime = (Date.now() - roundStartTime) / 1000;

    selectedButton.classList.add('selected');
    
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    socket.emit('submit_multiplayer_answer', {
        matchId: currentMatchId,
        answer: answer,
        time: answerTime // Include time in submission for server
    });
    
    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
    playerTimeEl.textContent = `YOU: Submitting...`;
}

// --- 6. UTILITY ---

/** Gets a CSS variable value. */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Resets the UI components for the start of a round or after a game ends. */
function resetUI(showRoundDisplay = true) {
    // Clear all dynamic content
    optionsContainerEl.innerHTML = '';
    flagImageEl.src = 'data:image/gif;base64,R0GODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
    resultMessageEl.textContent = '';
    
    // Reset time display
    playerTimeEl.textContent = 'YOU: --';
    opponentTimeEl.textContent = `${opponentUsername.toUpperCase()}: --`;
    
    // Ensure game elements are visible/hidden as appropriate
    roundDisplayEl.style.display = showRoundDisplay ? 'block' : 'none';
    flagImageEl.style.display = showRoundDisplay ? 'block' : 'none';
    optionsContainerEl.style.display = showRoundDisplay ? 'flex' : 'none';
    scoreboardContainerEl.style.display = showRoundDisplay ? 'flex' : 'none';
    
    // Reset button states and classes
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('selected', 'correct', 'incorrect');
    });
}