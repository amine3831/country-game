// main_game_logic.js

// --- 1. GLOBAL GAME STATE VARIABLES ---
// These variables manage the current state of the game on the client side.
let currentMatchId = null;
let isAnswered = false; // Prevents spamming answer button
let roundStartTime = 0; 
let myScore = 0;
let opponentScore = 0;
let isP1 = false; // Crucial for mapping scores from p1Score/p2Score

// --- 2. ELEMENT REFERENCES ---
// Elements are referenced here once at the start.
const gameContainerEl = document.getElementById('game-container');
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

// --- 3. VISUAL/STATE MANAGEMENT ---

/**
 * Resets the UI, showing or hiding the main quiz elements based on the game state.
 * It's called when transitioning between the menu, waiting, and active game screens.
 * @param {boolean} showRoundDisplay - True to show quiz elements (active round), False otherwise.
 */
function resetUI(showRoundDisplay = true) {
    // Clear all dynamic content
    optionsContainerEl.innerHTML = '';
    flagImageEl.src = 'data:image/gif;base64,R0GODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // Blank image placeholder
    resultMessageEl.textContent = '';
    playerTimeEl.textContent = 'YOU: --';
    opponentTimeEl.textContent = 'OPPONENT: --';
    
    // List of elements that are part of the active quiz UI
    const elementsToToggle = [
        roundDisplayEl, flagImageEl, optionsContainerEl, 
        resultMessageEl, playerTimeEl.parentElement, scoreboardContainerEl
    ];

    // Hide/Show elements based on stage
    elementsToToggle.forEach(el => {
        if (el) el.style.display = showRoundDisplay ? (el.id === 'options-container' ? 'flex' : 'block') : 'none';
    });
    
    // Hide the main title (H1) during an active game
    document.querySelector('h1').style.display = showRoundDisplay ? 'none' : 'flex';

    // Manage container centering for menu/waiting states
    if (showRoundDisplay) {
        // Game is active: Use default top-down flow
        gameContainerEl.classList.remove('centered-status');
        statusEl.style.display = 'flex'; // Status may still show 'Go!'
    } else {
        // Menu, Waiting, or Game Over screen: Center the remaining visible element
        gameContainerEl.classList.add('centered-status');
        
        // If the menu is showing (controlled by client_auth_menu.js), hide status
        const modeSelectionEl = document.getElementById('mode-selection');
        if (modeSelectionEl && modeSelectionEl.style.display === 'flex') {
            statusEl.style.display = 'none';
        } else {
             statusEl.style.display = 'flex'; // Show status while waiting
        }
    }
}

// --- 4. SOCKET LISTENERS (Game Flow) ---

// Note: socket.on('connect'), socket.on('auth_successful'), and socket.on('unauthorized_access') 
// are all handled by client_auth_menu.js

socket.on('waiting_for_opponent', () => {
    statusEl.textContent = '⏱️ Searching for opponent...';
    statusEl.style.color = getCssVar('--text-color');
    resetUI(false);
});

socket.on('match_found', (data) => {
    currentMatchId = data.matchId;
    isP1 = data.isP1; // Store P1/P2 status
    statusEl.textContent = '🤝 Match Found! Getting ready...';
    
    // Reset scores for a new match
    myScore = 0;
    opponentScore = 0;
    playerScoreEl.textContent = myScore;
    opponentScoreEl.textContent = opponentScore;
    
    // Clear status message once game starts
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000); 
});

// Listener for the single-player mode start confirmation
socket.on('computer_game_starting', (data) => {
    statusEl.textContent = data.message;
    // In a full implementation, this would trigger a dedicated single-player round flow
});

socket.on('new_round', (data) => {
    isAnswered = false;
    resetUI(true); // Show quiz elements
    
    roundStartTime = Date.now(); 
    
    statusEl.textContent = 'Go!';
    statusEl.style.color = getCssVar('--text-color');
    roundDisplayEl.textContent = `▶️ Round ${data.round}`;
    flagImageEl.src = data.image;

    // Reset button colors and enable them
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        btn.classList.remove('correct', 'incorrect', 'selected');
        btn.disabled = false;
    });
    
    // Populate options
    optionsContainerEl.innerHTML = ''; // Clear previous buttons
    data.options.forEach(optionText => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = optionText;
        button.onclick = () => handleAnswer(optionText, button);
        optionsContainerEl.appendChild(button);
    });
    
    resultMessageEl.textContent = 'Select the correct country!';
    resultMessageEl.style.color = getCssVar('--text-color');
});

socket.on('answer_registered', (data) => {
    const timeTaken = data.timeElapsed;
    
    if (data.isOpponent) {
        // This event is about the OPPONENT's answer
        opponentTimeEl.textContent = `OPPONENT: ${timeTaken.toFixed(2)}s`;
        resultMessageEl.textContent = 'Opponent answered! You must answer now.';
        resultMessageEl.style.color = getCssVar('--text-color');
        
    } else {
        // This event is about the LOCAL PLAYER's answer
        playerTimeEl.textContent = `YOU: ${timeTaken.toFixed(2)}s`;
        resultMessageEl.textContent = '✅ Answer Submitted! Waiting for opponent...';
        resultMessageEl.style.color = getCssVar('--primary-color');
    }
});


socket.on('round_results', (data) => {
    const optionButtons = optionsContainerEl.querySelectorAll('.option-button');
    const myId = socket.id;
    
    const wonRound = data.winnerId === myId;
    const opponentWon = data.winnerId && data.winnerId !== myId;
    
    // Map scores using the stored isP1 status
    const localScore = isP1 ? data.p1Score : data.p2Score;
    const oppScore = isP1 ? data.p2Score : data.p1Score;
    playerScoreEl.textContent = localScore;
    opponentScoreEl.textContent = oppScore;

    // --- Time Display Fix ---
    const localTime = isP1 ? data.p1Time : data.p2Time;
    const oppTime = isP1 ? data.p2Time : data.p1Time;

    if (localTime === Infinity) {
         playerTimeEl.textContent = `YOU: Missed`;
    } else if (!playerTimeEl.textContent.includes('Submitting')) { // Only update if not already submitted
         playerTimeEl.textContent = `YOU: ${localTime.toFixed(2)}s`;
    }
    
    if (oppTime === Infinity) {
        opponentTimeEl.textContent = `OPPONENT: Missed`;
    } else if (!opponentTimeEl.textContent.includes('Submitting')) {
        opponentTimeEl.textContent = `OPPONENT: ${oppTime.toFixed(2)}s`;
    }
    // --- End Time Display Fix ---

    // Style buttons based on result
    optionButtons.forEach(button => {
        button.disabled = true; // Disable all buttons
        
        if (button.textContent === data.correctAnswer) {
            button.classList.add('correct');
        } else if (button.classList.contains('selected')) {
            button.classList.add('incorrect'); // Selected but incorrect
        }
    });

    // Set result message
    if (wonRound) {
        resultMessageEl.textContent = '✅ CORRECT! You were faster!';
        resultMessageEl.style.color = getCssVar('--success-color');
    } else if (opponentWon) {
        resultMessageEl.textContent = '❌ Opponent scored this round!';
        resultMessageEl.style.color = getCssVar('--error-color');
    } else {
        resultMessageEl.textContent = `🤷 Correct answer was ${data.correctAnswer}.`;
        resultMessageEl.style.color = getCssVar('--text-color');
    }
});

socket.on('game_over', (data) => {
    resetUI(false); // Hide quiz elements
    
    // Map final scores
    const localScore = isP1 ? data.p1Score : data.p2Score;
    const oppScore = isP1 ? data.p2Score : data.p1Score;
    const finalScore = `Final Score: ${localScore} - ${oppScore}`;
    let message = '';
    let color = getCssVar('--text-color');

    if (data.winner === socket.id) {
        message = `🎉 YOU WON! ${finalScore}`;
        color = getCssVar('--success-color');
    } else if (data.winner) {
        message = `😭 YOU LOST. ${finalScore}`;
        color = getCssVar('--error-color');
    } else {
        message = `🤝 DRAW. ${finalScore}`;
        color = getCssVar('--text-color');
    }
    
    statusEl.textContent = message;
    statusEl.style.color = color;
    
    // Display final scoreboard
    playerScoreEl.textContent = localScore;
    opponentScoreEl.textContent = oppScore;
    scoreboardContainerEl.style.display = 'flex'; // Show final score
    
    // Offer to return to menu
    setTimeout(() => {
        statusEl.textContent += ' Click here to choose a new game mode!';
        statusEl.style.cursor = 'pointer';
        // Reloading the page returns to the authenticated menu screen
        statusEl.onclick = () => window.location.reload(); 
    }, 5000);
});

socket.on('opponent_disconnected', (message) => {
    resetUI(false);
    statusEl.textContent = `🚨 ${message}`;
    statusEl.style.color = getCssVar('--error-color');
    
    setTimeout(() => {
        statusEl.textContent += ' Click here to choose a new game mode!';
        statusEl.style.cursor = 'pointer';
        statusEl.onclick = () => window.location.reload(); 
    }, 3000);
});

// --- 5. USER INPUT HANDLER ---

/**
 * Handles the player's answer selection.
 * @param {string} answer - The country name selected.
 * @param {HTMLElement} selectedButton - The button element clicked.
 */
function handleAnswer(answer, selectedButton) {
    if (isAnswered || !currentMatchId) return;
    
    isAnswered = true;

    // Visual feedback for selection
    selectedButton.classList.add('selected');
    
    // Disable other buttons immediately
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    // Send answer to server
    socket.emit('submit_answer', {
        matchId: currentMatchId,
        answer: answer
    });
    
    // Client-side visual update while waiting for server confirmation
    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
}

// --- 6. UTILITY ---

/** Gets a CSS variable value. */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
