// simple_game_logic.js - Handles Solo Game Flow and UI

// --- 1. GLOBAL UI REFERENCES & STATE ---

// Element references matching simple_game.html:
// Note: 'game-container' is not strictly needed but included for completeness.
const gameContainerEl = document.getElementById('game-container');
const flagImageEl = document.getElementById('current-flag');
const optionsContainerEl = document.getElementById('options-container');
const roundDisplayEl = document.getElementById('round-display'); // Used for round/streak count
const resultMessageEl = document.getElementById('result-message');
const statusEl = document.getElementById('status');
const playerScoreEl = document.getElementById('player-score');
const highscoreEl = document.getElementById('opponent-score'); // Used for high score display

let soloScore = 0;
let isAnswered = false;


// --- 2. UTILITY FUNCTIONS ---

function getCssVar(name) {
    // Helper to fetch CSS variables for colors
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function handleSoloAnswer(answer, selectedButton, socket) {
    if (isAnswered) return;
    
    isAnswered = true;
    selectedButton.classList.add('selected');

    // Disable all options immediately
    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        btn.disabled = true;
    });

    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');

    // Emit the answer to the server
    socket.emit('submit_solo_answer', { answer: answer });
}

function resetGameUI() {
    // Hide game elements and show status
    statusEl.style.display = 'flex';
    roundDisplayEl.textContent = '';
    flagImageEl.style.display = 'none';
    optionsContainerEl.style.display = 'none';
    resultMessageEl.textContent = '';
    
    // Clear the high score and streak displays
    playerScoreEl.textContent = '0';
    highscoreEl.textContent = '0';
}


// --- 3. CORE SOLO GAME INITIALIZATION WRAPPER ---

// CRITICAL FIX: All game logic runs inside this function, called by client_auth_menu.js
window.initializeSoloGameLogic = function(socket) {
    console.log("Solo game logic starting and listeners attaching...");
    
    // Initial State Reset
    soloScore = 0;
    resetGameUI();

    // Send the initial start signal to the server
    socket.emit('start_solo_game');

    // --- Solo Game Socket Listeners ---
    
    socket.on('solo_new_round', (data) => {
        isAnswered = false;
        
        // Show game elements
        statusEl.style.display = 'none';
        flagImageEl.style.display = 'block';
        optionsContainerEl.style.display = 'flex';
        
        // Update display elements
        roundDisplayEl.textContent = `Streak: ${soloScore}`;
        resultMessageEl.textContent = 'Select the correct country!';
        resultMessageEl.style.color = getCssVar('--text-color');
        
        // Update flag and score
        flagImageEl.src = data.image;
        playerScoreEl.textContent = soloScore;
        // Server sends the current High Score on every new round
        highscoreEl.textContent = data.highScore; 

        // Populate buttons
        optionsContainerEl.innerHTML = '';
        data.options.forEach(optionText => {
            const button = document.createElement('button');
            button.className = 'option-button';
            button.textContent = optionText;
            // Use an anonymous function to pass the socket object to the handler
            button.onclick = () => handleSoloAnswer(optionText, button, socket);
            optionsContainerEl.appendChild(button);
        });
    });

    socket.on('solo_feedback', (data) => {
        const selectedButton = optionsContainerEl.querySelector('.option-button.selected');
        
        if (data.isCorrect) {
            soloScore++;
            playerScoreEl.textContent = soloScore;
            selectedButton.classList.remove('selected');
            selectedButton.classList.add('correct');
            
            resultMessageEl.textContent = '✅ CORRECT! Next flag loading...';
            resultMessageEl.style.color = getCssVar('--success-color');
            
            // Start next round after a delay
             setTimeout(() => {
                socket.emit('request_solo_round'); // Request a new round from the server
             }, 1000); // 1 second delay
             
        } else {
            // Incorrect answer: Game Over
            
            selectedButton.classList.add('incorrect');
            
            // Highlight the correct answer
            optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
                if (btn.textContent === data.correctAnswer) {
                    btn.classList.add('correct');
                }
            });
            
            resultMessageEl.textContent = `❌ INCORRECT! Correct was ${data.correctAnswer}.`;
            resultMessageEl.style.color = getCssVar('--error-color');
            
            // The server sends the 'solo_game_over' event immediately after this feedback, 
            // so we just wait for that event to trigger the final UI change.
        }
    });
    
    socket.on('solo_game_over', (data) => {
        soloScore = 0; // Reset client streak
        
        // Hide game elements
        flagImageEl.style.display = 'none';
        optionsContainerEl.style.display = 'none';
        resultMessageEl.style.display = 'none';
        roundDisplayEl.style.display = 'none';
        
        // Display final score status
        statusEl.style.display = 'flex';
        statusEl.textContent = `Game Over! Final Streak: ${data.score}. High Score: ${data.highScore}`;
        statusEl.style.color = getCssVar('--primary-color');
        
        // Update scoreboard one last time
        playerScoreEl.textContent = '0';
        highscoreEl.textContent = data.highScore; 
        
        // After game over, clicking the status text can lead back to the main menu
        statusEl.onclick = () => {
             window.location.href = 'index.html' + window.location.search;
        };
    });

};
