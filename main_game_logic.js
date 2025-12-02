// main_game_logic.js (UPDATED FIX - Focus on Section 5)

// --- 1. GLOBAL GAME STATE VARIABLES ---
let currentMatchId = null;
let isAnswered = false; // Prevents spamming answer button
let roundStartTime = 0; 
let myScore = 0;
let opponentScore = 0;
let isP1 = false; 

// --- 2. ELEMENT REFERENCES ---
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

// --- 3. VISUAL/STATE MANAGEMENT (UNCHANGED) ---
function resetUI(showRoundDisplay = true) {
    // ... (Your existing resetUI function code remains here, unchanged)
}

// --- 4. SOCKET LISTENERS (Event names need to be reviewed for consistency) ---

// NOTE: Socket events from server.js are 'searching', 'match_started', 'multiplayer_new_round', 'multiplayer_feedback', 'match_game_over', 'match_ended_opponent_disconnect'
// Ensure your client listener names match these. I will use the corrected server names below:

socket.on('searching', () => { // Corrected from 'waiting_for_opponent' to match server log/intent
    statusEl.textContent = '⏱️ Searching for opponent...';
    statusEl.style.color = getCssVar('--text-color');
    resetUI(false);
});

socket.on('match_started', (data) => { // Corrected from 'match_found' to match server emission
    currentMatchId = data.matchId;
    
    // Determine my ID and map it to P1/P2 status
    const myId = socket.id;
    isP1 = (Object.keys(data.playerMap)[0] === myId); // If my ID is the first key, I am P1

    statusEl.textContent = `🤝 Match Found! Opponent: ${data.opponent}. Getting ready...`;
    
    // Reset scores for a new match
    myScore = 0;
    opponentScore = 0;
    playerScoreEl.textContent = myScore;
    opponentScoreEl.textContent = opponentScore;
    
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000); 
});

socket.on('multiplayer_new_round', (data) => { // Corrected from 'new_round' to match server emission
    isAnswered = false;
    resetUI(true); // Show quiz elements
    
    roundStartTime = Date.now(); 
    
    statusEl.textContent = 'Go!';
    statusEl.style.color = getCssVar('--text-color');
    roundDisplayEl.textContent = `▶️ Round ${data.roundNumber} of ${data.maxRounds}`;
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

socket.on('multiplayer_feedback', (data) => { // Corrected from 'answer_registered' to match server intent
    // This event is only feedback on MY answer, NOT the opponent's.
    // Opponent answer feedback is integrated into round_results/next_round timing.
    const selectedButton = optionsContainerEl.querySelector('.option-button.selected');

    if (data.isCorrect) {
        selectedButton.classList.add('correct');
        resultMessageEl.textContent = '✅ CORRECT! Waiting for opponent...';
        resultMessageEl.style.color = getCssVar('--success-color');
    } else {
        selectedButton.classList.add('incorrect');
        resultMessageEl.textContent = '❌ INCORRECT. Waiting for opponent...';
        resultMessageEl.style.color = getCssVar('--error-color');
    }
    playerTimeEl.textContent = `YOU: Answered`; // Simple visual confirmation
    
    // Disable all buttons after feedback
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
});


socket.on('round_results', (data) => {
    // NOTE: The server doesn't emit 'round_results', it emits the next round immediately.
    // If you need a separate result screen, we need to change the server code.
    // Assuming you meant 'multiplayer_new_round' handles the score update implicitly.

    // *** THIS SECTION IS LIKELY UNUSED/BROKEN DUE TO SERVER LOGIC ***
    // The server does not send individual player times, only final scores in the next round data.
    // For now, removing complex logic here until server logic is updated to send this data.

    // ... (Removing old complex score/time logic) ...

    // The simplest fix is to show the correct answer and wait for the new round event.
    optionsContainerEl.querySelectorAll('.option-button').forEach(button => {
        if (button.textContent === data.correctAnswer) {
            button.classList.add('correct');
        }
    });

    // We rely on the 'multiplayer_new_round' event to update scores and progress.
    resultMessageEl.textContent = `The correct answer was ${data.correctAnswer}. Loading next round...`;
    resultMessageEl.style.color = getCssVar('--text-color');
});

socket.on('match_game_over', (data) => { // Corrected from 'game_over'
    // ... (Your existing game_over function code remains here, relying on data.scores for final tally)
    
    // Map final scores using the playerMap (data.scores is an array of {username, score})
    const myUsername = document.getElementById('username-display').textContent; // Assuming you have this
    
    const localScoreData = data.scores.find(s => s.username === myUsername);
    const oppScoreData = data.scores.find(s => s.username !== myUsername);
    
    const localScore = localScoreData ? localScoreData.score : 0;
    const oppScore = oppScoreData ? oppScoreData.score : 0;
    
    // ... (Rest of game_over logic) ...
});

socket.on('match_ended_opponent_disconnect', (data) => { // Corrected from 'opponent_disconnected'
    resetUI(false);
    statusEl.textContent = `🚨 Opponent disconnected! You win by forfeit.`;
    statusEl.style.color = getCssVar('--error-color');
    
    // ... (Rest of disconnect logic) ...
});


// --- 5. USER INPUT HANDLER (CRITICAL FIX) ---

function handleAnswer(answer, selectedButton) {
    if (isAnswered || !currentMatchId) return;
    
    isAnswered = true;

    selectedButton.classList.add('selected');
    
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    // ⭐ CRITICAL FIX: Emit the correct event name for the server
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
