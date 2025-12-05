// simple_game_logic.js - Handles the Simple (Solo/Streak) Game Flow using HTTP API

// --- HELPER FUNCTION & AUTHENTICATION CHECK ---

/** Helper function to read query parameters from the URL. */
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const userId = getQueryParameter('userId'); 
const username = getQueryParameter('username'); 

// CRITICAL CHECK: If auth data is missing, redirect back to the main page.
if (!userId || !username) {
    // Cannot use alert(), use console error and redirect.
    console.error("Authentication failed! Redirecting to menu.");
    window.location.href = 'index.html'; 
}


// --- 1. GLOBAL GAME STATE VARIABLES ---
let isAnswered = false; // Prevents spamming answer button
let isGameOver = true; // Start in game over state until first question is loaded

// --- 2. ELEMENT REFERENCES ---
const statusEl = document.getElementById('status');
const roundDisplayEl = document.getElementById('round-display');
const flagImageEl = document.getElementById('current-flag');
const optionsContainerEl = document.getElementById('options-container');
const resultMessageEl = document.getElementById('result-message');
const playerScoreEl = document.getElementById('player-score'); // Tracks current streak
const opponentScoreEl = document.getElementById('opponent-score'); // Tracks high score
const scoreboardContainerEl = document.getElementById('scoreboard-container');

// --- 3. UTILITY (same as in main_game_logic.js) ---

/** Gets a CSS variable value. */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Hides all game elements and shows status. */
function resetUI() {
    optionsContainerEl.innerHTML = '';
    flagImageEl.style.display = 'none';
    optionsContainerEl.style.display = 'none';
    resultMessageEl.textContent = '';
    
    // Ensure scores are visible if loaded, otherwise hide
    if (!isGameOver) {
        scoreboardContainerEl.style.display = 'flex';
    }
}

// --- 4. CORE GAME FLOW FUNCTIONS ---

/**
 * Initiates the game or fetches the next question via HTTP GET.
 * @param {boolean} isReset - True if starting a new game (resetting streak).
 */
async function fetchNextQuestion(isReset = false) {
    resetUI();
    
    // Build the query URL
    const resetQuery = isReset ? '&reset=true' : '';
    const apiUrl = `/api/simple/get_question?userId=${userId}${resetQuery}`;

    statusEl.textContent = isReset ? 'Starting new game...' : 'Loading next flag...';
    statusEl.style.display = 'block';

    try {
        const response = await fetch(apiUrl);
        if (response.status === 401) {
             // Handle unauthenticated state
             statusEl.textContent = 'Session expired. Redirecting...';
             setTimeout(() => window.location.href = 'index.html', 2000);
             return;
        }
        
        const data = await response.json();

        isAnswered = false;
        isGameOver = false; // Game is active

        // Update Scores/Status
        playerScoreEl.textContent = data.currentStreak;
        opponentScoreEl.textContent = data.highScore;
        roundDisplayEl.textContent = `Current Streak: ${data.currentStreak}`;
        roundDisplayEl.style.display = 'block';

        // Update UI with new question
        flagImageEl.src = data.flagImage;
        flagImageEl.style.display = 'block';
        
        optionsContainerEl.innerHTML = ''; // Clear previous options
        data.options.forEach(country => {
            const button = document.createElement('button');
            button.className = 'option-button';
            button.textContent = country;
            // The handler now directly calls the HTTP submission function
            button.addEventListener('click', () => handleAnswer(country, button)); 
            optionsContainerEl.appendChild(button);
        });
        
        optionsContainerEl.style.display = 'flex';
        statusEl.style.display = 'none';
        
    } catch (error) {
        console.error('Error fetching question:', error);
        statusEl.textContent = '❌ Error loading game data. Try refreshing.';
        statusEl.style.color = getCssVar('--error-color');
    }
}


/**
 * Submits the player's answer via HTTP POST.
 * @param {string} answer - The country name selected.
 * @param {HTMLElement} selectedButton - The button element clicked.
 */
async function handleAnswer(answer, selectedButton) {
    if (isAnswered) return;
    
    isAnswered = true;
    selectedButton.classList.add('selected');
    
    // Disable all buttons to prevent double-clicking
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        btn.disabled = true;
    });

    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
    
    try {
        const response = await fetch('/api/simple/submit_answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId: userId, answer: answer }),
        });
        
        const result = await response.json();
        
        if (result.error) {
            resultMessageEl.textContent = `Submission Error: ${result.error}`;
            return;
        }

        // --- Handle Result & UI Feedback ---
        
        const correct = result.correctAnswer;
        const isCorrect = result.isCorrect;
        
        // Highlight the correct answer
        optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
            if (btn.textContent === correct) {
                btn.classList.add('correct');
            }
        });
        
        if (isCorrect) {
            resultMessageEl.textContent = '✅ CORRECT! Keep the streak going!';
            resultMessageEl.style.color = getCssVar('--success-color');
        } else {
            resultMessageEl.textContent = `❌ INCORRECT! The correct answer was: ${correct}`;
            resultMessageEl.style.color = getCssVar('--error-color');
        }
        
        // Update scoreboard immediately with new streak and high score
        playerScoreEl.textContent = result.currentStreak;
        opponentScoreEl.textContent = result.highScore;
        
        
        // --- Game Flow: Continue or Game Over ---
        
        if (result.status === 'game_over') {
            handleGameOver(result.currentStreak, result.highScore);
        } else {
            // If correct, load next question after a delay
            setTimeout(() => fetchNextQuestion(), 2000); 
        }
        
    } catch (error) {
        console.error('Error submitting answer:', error);
        resultMessageEl.textContent = '❌ Network error during submission.';
        resultMessageEl.style.color = getCssVar('--error-color');
    }
}

/**
 * Handles the game over state after an incorrect answer.
 * @param {number} finalStreak - The streak the player achieved in the session.
 * @param {number} highScore - The new/old high score.
 */
function handleGameOver(finalStreak, highScore) {
    isGameOver = true;
    optionsContainerEl.style.display = 'none'; // Hide options
    roundDisplayEl.style.display = 'none';
    
    statusEl.textContent = `🔥 GAME OVER! Final Streak: ${finalStreak}.`;
    statusEl.style.color = getCssVar('--error-color');
    statusEl.style.display = 'block';

    playerScoreEl.textContent = finalStreak;
    opponentScoreEl.textContent = highScore; 
    scoreboardContainerEl.style.display = 'flex';
    
    // Offer to try again
    const tryAgainButton = document.createElement('button');
    tryAgainButton.textContent = 'Click to Try Again';
    tryAgainButton.className = 'restart-button';
    tryAgainButton.style.marginTop = '20px';
    tryAgainButton.style.padding = '10px 20px';
    tryAgainButton.style.backgroundColor = getCssVar('--primary-color');
    tryAgainButton.style.color = 'white';
    tryAgainButton.style.border = 'none';
    tryAgainButton.style.borderRadius = '5px';
    tryAgainButton.style.cursor = 'pointer';

    // Remove old button if it exists
    const oldButton = document.querySelector('.restart-button');
    if (oldButton) oldButton.remove();

    tryAgainButton.onclick = () => {
        tryAgainButton.remove();
        fetchNextQuestion(true); // Reset the game
    };
    
    // Append the try again button below the status
    statusEl.parentNode.insertBefore(tryAgainButton, statusEl.nextSibling);

}


// --- 5. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Start the game by fetching the first question
    fetchNextQuestion(true);
});