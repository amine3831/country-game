// simple_game_logic.js

// --- HELPER FUNCTION & AUTHENTICATION CHECK (CRITICAL FIX) ---

/** Helper function to read query parameters from the URL. */
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const userId = getQueryParameter('userId'); 

// CRITICAL CHECK: If userId is missing, redirect back to the main page to force authentication.
if (!userId) {
    alert("Authentication failed! Redirecting to login page.");
    window.location.href = 'index.html'; // Assume index.html handles the redirect to login
}

// Initialize socket connection using the confirmed userId
const RENDER_URL = window.location.protocol + "//" + window.location.host; 
const socket = io(RENDER_URL, {
    query: { userId: userId } 
});

// --- 1. GLOBAL GAME STATE VARIABLES ---
let isAnswered = false; // Prevents spamming answer button

// --- 2. ELEMENT REFERENCES ---
const gameContainerEl = document.getElementById('game-container');
const statusEl = document.getElementById('status');
const roundDisplayEl = document.getElementById('round-display');
const flagImageEl = document.getElementById('current-flag');
const optionsContainerEl = document.getElementById('options-container');
const resultMessageEl = document.getElementById('result-message');
const playerScoreEl = document.getElementById('player-score'); // Tracks current streak
const opponentScoreEl = document.getElementById('opponent-score'); // Tracks high score
const scoreboardContainerEl = document.getElementById('scoreboard-container');


// --- 3. VISUAL/STATE MANAGEMENT ---

/**
 * Resets the UI, showing or hiding the quiz elements.
 * @param {boolean} showQuizElements - True to show quiz elements, False otherwise.
 */
function resetUI(showQuizElements = true) {
    // Clear all dynamic content
    optionsContainerEl.innerHTML = '';
    flagImageEl.src = 'data:image/gif;base64,R0GODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
    resultMessageEl.textContent = '';
    
    // List of elements that are part of the active quiz UI
    const elementsToToggle = [
        roundDisplayEl, flagImageEl, optionsContainerEl, 
        resultMessageEl, scoreboardContainerEl
    ];

    // Hide/Show elements based on stage
    elementsToToggle.forEach(el => {
        if (el) el.style.display = showQuizElements ? (el.id === 'options-container' ? 'flex' : 'block') : 'none';
    });
    
    document.querySelector('h1').style.display = showQuizElements ? 'none' : 'flex';

    if (showQuizElements) {
        gameContainerEl.classList.remove('centered-status');
        statusEl.style.display = 'flex'; 
    } else {
        gameContainerEl.classList.add('centered-status');
        statusEl.style.display = 'flex';
    }
}


// --- 4. SOCKET LISTENERS (Simple Game Flow) ---

socket.on('connect', () => {
    statusEl.textContent = '✅ Connected. Starting game...';
    resetUI(false); 
    
    // Request the first round immediately upon connecting to the simple_game page
    socket.emit('start_simple_session');
});

// --- SIMPLE GAME LISTENERS ---

socket.on('simple_new_round', (data) => {
    isAnswered = false;
    resetUI(true); // Show quiz elements
    
    // Update Streak and High Score displays
    playerScoreEl.textContent = data.streak;
    opponentScoreEl.textContent = data.highScore; 
    
    statusEl.textContent = 'Go!';
    statusEl.style.color = getCssVar('--text-color');
    roundDisplayEl.textContent = `⭐ Streak: ${data.streak}`;
    flagImageEl.src = data.image;

    // Populate options
    optionsContainerEl.innerHTML = '';
    data.options.forEach(optionText => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = optionText;
        button.onclick = () => handleAnswer(optionText, button); // Use common handler
        optionsContainerEl.appendChild(button);
    });
    
    resultMessageEl.textContent = 'Select the correct country!';
    resultMessageEl.style.color = getCssVar('--text-color');
});

socket.on('simple_game_feedback', (data) => {
    const optionButtons = optionsContainerEl.querySelectorAll('.option-button');
    
    optionButtons.forEach(button => {
        button.disabled = true; // Disable all buttons
        if (button.textContent === data.correctAnswer) {
            button.classList.add('correct');
        } else if (button.classList.contains('selected')) {
            button.classList.add('incorrect'); 
        }
    });
    
    if (data.isCorrect) {
        resultMessageEl.textContent = '✅ Correct! Get ready for the next one...';
        resultMessageEl.style.color = getCssVar('--success-color');
        
        // The server will send 'simple_new_round' immediately after this
    } else {
        // Game Over will be handled by simple_game_over listener
        resultMessageEl.textContent = `❌ WRONG! Game Over.`;
        resultMessageEl.style.color = getCssVar('--error-color');
    }
});


socket.on('simple_game_over', (data) => {
    resetUI(false); // Hide quiz elements
    
    const finalStreak = data.finalStreak;
    const highScore = data.highScore;
    
    const message = `💔 GAME OVER! Your final streak was ${finalStreak}.`;
    statusEl.textContent = message;
    statusEl.style.color = getCssVar('--error-color');
    
    // Display final scores
    playerScoreEl.textContent = finalStreak;
    opponentScoreEl.textContent = highScore; 
    scoreboardContainerEl.style.display = 'flex';
    
    // Offer to return to menu
    setTimeout(() => {
        statusEl.textContent += ' Click here to try again!';
        statusEl.style.cursor = 'pointer';
        // Go back to the menu (index.html)
        statusEl.onclick = () => window.location.href = 'index.html' + window.location.search; 
    }, 5000);
});

// --- 5. USER INPUT HANDLER ---

/**
 * Handles the player's answer selection for the Simple Game.
 * @param {string} answer - The country name selected.
 * @param {HTMLElement} selectedButton - The button element clicked.
 */
function handleAnswer(answer, selectedButton) {
    if (isAnswered) return;
    
    isAnswered = true;

    selectedButton.classList.add('selected');
    
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    // Use dedicated simple answer submission event
    socket.emit('submit_simple_answer', {
        answer: answer
    });
    
    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
}

// --- 6. UTILITY ---

/** Gets a CSS variable value. */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
