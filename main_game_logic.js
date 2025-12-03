// main_game_logic.js - Handles the Multiplayer Match Flow and UI

// --- 1. GLOBAL GAME STATE VARIABLES ---
let currentMatchId = null;
let isAnswered = false; // Prevents spamming answer button
let roundStartTime = 0; 
let myScore = 0;
let opponentScore = 0;
let isP1 = false; 

// --- 2. ELEMENT REFERENCES (CRITICAL FIX APPLIED HERE) ---
// Ensure these IDs exist in your index.html
const gameContainerEl = document.getElementById('game-area'); // ⬅️ FIXED: Changed from 'game-container' to 'game-area'
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
const myUsername = document.getElementById('username-display').textContent; 

// --- 3. VISUAL/STATE MANAGEMENT (UNCHANGED) ---

function resetUI(showRoundDisplay = true) {
    // Clear all dynamic content
    optionsContainerEl.innerHTML = '';
    flagImageEl.src = 'data:image/gif;base64,R0GODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
    resultMessageEl.textContent = '';
    playerTimeEl.textContent = 'YOU: --';
    opponentTimeEl.textContent = 'OPPONENT: --';
    
    const elementsToToggle = [
        roundDisplayEl, flagImageEl, optionsContainerEl, 
        resultMessageEl, playerTimeEl.parentElement, opponentTimeEl.parentElement, scoreboardContainerEl
    ];

    elementsToToggle.forEach(el => {
        if (el) el.style.display = showRoundDisplay ? (el.id === 'options-container' ? 'flex' : 'block') : 'none';
    });
    
    if (showRoundDisplay) {
        document.querySelector('h1').style.display = 'none';
        gameContainerEl.classList.remove('centered-status');
        statusEl.style.display = 'flex'; 
    } else {
        document.querySelector('h1').style.display = 'flex';
        gameContainerEl.classList.add('centered-status');
        
        const modeSelectionEl = document.getElementById('mode-selection');
        if (modeSelectionEl && modeSelectionEl.style.display === 'flex') {
            statusEl.style.display = 'none';
        } else {
             statusEl.style.display = 'flex';
        }
        
        document.querySelector('#player-score-container .label').textContent = 'YOU';
        document.querySelector('#opponent-score-container .label').textContent = 'OPPONENT';
    }
}

// --- 4. SOCKET LISTENERS (FIXED LOGIC) ---

socket.on('searching', () => { 
    statusEl.textContent = '⏱️ Searching for opponent...';
    statusEl.style.color = getCssVar('--text-color');
    resetUI(false);
});

socket.on('match_started', (data) => {
    currentMatchId = data.matchId;
    
    // Determine opponent's name from playerMap
    const opponentUsername = Object.values(data.playerMap).find(name => name !== myUsername) || 'Opponent';

    statusEl.textContent = `🤝 Match Found! Opponent: ${opponentUsername}. Getting ready...`;
    
    myScore = 0;
    opponentScore = 0;
    playerScoreEl.textContent = myScore;
    opponentScoreEl.textContent = opponentScore;
    
    // CRITICAL UI FIX: Hide the status and show the game container
    if (statusEl) {
        statusEl.style.display = 'none'; 
    }
    
    if (gameContainerEl) {
        gameContainerEl.style.display = 'block'; 
    }
});

socket.on('multiplayer_new_round', (data) => { 
    isAnswered = false;
    resetUI(true); // Show quiz elements
    
    roundStartTime = Date.now(); 
    
    statusEl.textContent = 'Go!';
    statusEl.style.color = getCssVar('--text-color');
    roundDisplayEl.textContent = `▶️ Round ${data.roundNumber} of ${data.maxRounds}`;
    flagImageEl.src = data.image;

    // Robustly update scores using the username map from the server
    const scoreMap = data.scores || {};
    const localScore = scoreMap[myUsername] || 0;
    
    // Find opponent's username and score
    const opponentUsername = Object.keys(scoreMap).find(name => name !== myUsername);
    const opponentScore = opponentUsername ? scoreMap[opponentUsername] : 0;

    playerScoreEl.textContent = localScore;
    opponentScoreEl.textContent = opponentScore;
    
    // Reset buttons
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        btn.classList.remove('correct', 'incorrect', 'selected');
        btn.disabled = false;
    });
    
    // Populate options
    optionsContainerEl.innerHTML = ''; 
    data.options.forEach(optionText => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = optionText;
        button.onclick = () => handleAnswer(optionText, button);
        optionsContainerEl.appendChild(button);
    });
    
    resultMessageEl.textContent = 'Select the correct country!';
    resultMessageEl.style.color = getCssVar('--text-color');
    playerTimeEl.textContent = 'YOU: --';
    opponentTimeEl.textContent = 'OPPONENT: --';
});

socket.on('multiplayer_feedback', (data) => { 
    const selectedButton = optionsContainerEl.querySelector('.option-button.selected');

    if (data.isCorrect) {
        selectedButton.classList.add('correct');
        resultMessageEl.textContent = '✅ CORRECT! Waiting for opponent...';
        resultMessageEl.style.color = getCssVar('--success-color');
    } else {
        selectedButton.classList.add('incorrect');
        // Highlight the correct answer
        optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
            if (btn.textContent === data.correctAnswer) {
                btn.classList.add('correct');
            }
        });
        resultMessageEl.textContent = `❌ INCORRECT. Correct was ${data.correctAnswer}. Waiting for opponent...`;
        resultMessageEl.style.color = getCssVar('--error-color');
    }
    
    playerTimeEl.textContent = `YOU: Answered`; 
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
});

socket.on('match_game_over', (data) => { 
    resetUI(false); 
    
    // The server sends data.scores as an array of {username, score}
    const localScoreData = data.scores.find(s => s.username === myUsername);
    const oppScoreData = data.scores.find(s => s.username !== myUsername);
    
    const localScore = localScoreData ? localScoreData.score : 0;
    const oppScore = oppScoreData ? oppScoreData.score : 0;
    const finalScore = `Final Score: ${localScore} - ${oppScore}`;
    let message = '';
    let color = getCssVar('--text-color');

    if (data.winner === myUsername) {
        message = `🎉 YOU WON! ${finalScore}`;
        color = getCssVar('--success-color');
    } else if (data.winner === 'Tie') {
        message = `🤝 DRAW. ${finalScore}`;
        color = getCssVar('--text-color');
    } else {
        // Opponent won (data.winner is the opponent's username)
        message = `😭 YOU LOST. ${finalScore}`;
        color = getCssVar('--error-color');
    }
    
    statusEl.textContent = message;
    statusEl.style.color = color;
    playerScoreEl.textContent = localScore;
    opponentScoreEl.textContent = oppScore;
    scoreboardContainerEl.style.display = 'flex';
    
    setTimeout(() => {
        statusEl.textContent += ' Click here to choose a new game mode!';
        statusEl.style.cursor = 'pointer';
        statusEl.onclick = () => window.location.reload(); 
    }, 5000);
});

socket.on('match_ended_opponent_disconnect', (data) => { 
    resetUI(false);
    statusEl.textContent = `🚨 Opponent disconnected! You win by forfeit.`;
    statusEl.style.color = getCssVar('--error-color');
    
    setTimeout(() => {
        statusEl.textContent += ' Click here to choose a new game mode!';
        statusEl.style.cursor = 'pointer';
        statusEl.onclick = () => window.location.reload(); 
    }, 3000);
});


// --- 5. USER INPUT HANDLER (CORRECT EMISSION NAME) ---

function handleAnswer(answer, selectedButton) {
    if (isAnswered || !currentMatchId) return;
    
    isAnswered = true;

    selectedButton.classList.add('selected');
    
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    // Correctly emits the 'submit_multiplayer_answer' event expected by the server
    socket.emit('submit_multiplayer_answer', {
        matchId: currentMatchId,
        answer: answer
    });
    
    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
    playerTimeEl.textContent = `YOU: Submitting...`;
}

// --- 6. UTILITY (UNCHANGED) ---

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
