// simple_game_logic.js (FINAL CORRECTED VERSION)

// --- 1. GLOBAL GAME STATE VARIABLES & ELEMENT REFERENCES ---
let isAnswered = false; 

const gameContainerEl = document.getElementById('game-container');
const statusEl = document.getElementById('status');
const roundDisplayEl = document.getElementById('round-display');
const flagImageEl = document.getElementById('current-flag');
const optionsContainerEl = document.getElementById('options-container');
const resultMessageEl = document.getElementById('result-message');
const playerScoreEl = document.getElementById('player-score'); 
const opponentScoreEl = document.getElementById('opponent-score'); 
const scoreboardContainerEl = document.getElementById('scoreboard-container');

// Helper function to get CSS variable values
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Helper function to reset the UI elements
function resetGameUI() {
    statusEl.style.display = 'flex';
    statusEl.textContent = 'Connecting to server...';
    roundDisplayEl.textContent = '';
    flagImageEl.style.display = 'none';
    optionsContainerEl.style.display = 'none';
    resultMessageEl.textContent = '';
    
    playerScoreEl.textContent = '0';
    opponentScoreEl.textContent = '0';
    scoreboardContainerEl.style.display = 'flex';
}

// --- 2. CORE SOLO GAME INITIALIZATION WRAPPER ---
// This function MUST be defined globally and wait to be called by client_auth_menu.js
window.initializeSoloGameLogic = function(socket) { 
    console.log("Solo game logic starting and listeners attaching...");
    
    let soloScore = 0; // Local score for the current streak

    // Send the initial start signal to the server
    socket.emit('start_solo_game'); // <--- Sends the request for the first round
    
    // --- Solo Game Socket Listeners ---
    
    socket.on('solo_new_round', (data) => {
        isAnswered = false;
        
        // Hide the "Connecting" status and show game elements
        statusEl.style.display = 'none';
        flagImageEl.style.display = 'block';
        optionsContainerEl.style.display = 'flex';
        scoreboardContainerEl.style.display = 'flex';
        
        // Update display elements
        soloScore = data.streak;
        roundDisplayEl.textContent = `Streak: ${soloScore}`;
        resultMessageEl.textContent = 'Select the correct country!';
        resultMessageEl.style.color = getCssVar('--text-color');
        
        // Update flag and score
        flagImageEl.src = data.image;
        playerScoreEl.textContent = soloScore;
        opponentScoreEl.textContent = data.highScore; // Displaying High Score as Opponent Score

        // Populate buttons
        optionsContainerEl.innerHTML = '';
        data.options.forEach(optionText => {
            const button = document.createElement('button');
            button.className = 'option-button';
            button.textContent = optionText;
            button.onclick = () => handleSoloAnswer(optionText, button, socket);
            optionsContainerEl.appendChild(button);
        });
    });

    socket.on('solo_feedback', (data) => {
        const selectedButton = optionsContainerEl.querySelector('.option-button.selected') || 
                               optionsContainerEl.querySelector('.option-button:disabled:not(.correct)');
        
        // Disabling all buttons after feedback is received
        optionsContainerEl.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
        
        if (data.isCorrect) {
            
            if (selectedButton) selectedButton.classList.remove('selected');
            
            optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
                if (btn.textContent === data.correctAnswer) {
                    btn.classList.add('correct');
                }
            });
            
            resultMessageEl.textContent = '✅ CORRECT! Next flag loading...';
            resultMessageEl.style.color = getCssVar('--success-color');
            
             setTimeout(() => {
                // Request next round (Server handles streak increment)
                socket.emit('request_solo_round'); 
             }, 1000); 
             
        } else {
            // Incorrect answer: Game Over
            
            if (selectedButton) selectedButton.classList.add('incorrect');
            
            // Highlight the correct answer
            optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
                if (btn.textContent === data.correctAnswer) {
                    btn.classList.add('correct');
                }
            });
            
            resultMessageEl.textContent = `❌ INCORRECT! Correct was ${data.correctAnswer}.`;
            resultMessageEl.style.color = getCssVar('--error-color');
        }
    });
    
    socket.on('solo_game_over', (data) => {
        
        // Display final score status
        statusEl.style.display = 'flex';
        statusEl.textContent = `Game Over! Final Streak: ${data.score}. High Score: ${data.highScore}`;
        statusEl.style.color = getCssVar('--primary-color');
        
        // Hide game elements
        flagImageEl.style.display = 'none';
        optionsContainerEl.style.display = 'none';
        roundDisplayEl.style.display = 'none';
        
        // Offer to return to menu
        statusEl.style.cursor = 'pointer';
        // Go back to the menu (index.html)
        statusEl.onclick = () => window.location.href = 'index.html' + window.location.search; 
    });
};

// --- 3. USER INPUT HANDLER (ADJUSTED TO ACCEPT SOCKET) ---
// This function is defined outside the wrapper but uses the socket passed to it
function handleSoloAnswer(answer, selectedButton, socket) {
    if (isAnswered) return;
    
    isAnswered = true;
    selectedButton.classList.add('selected');

    optionsContainerEl.querySelectorAll('.option-button').forEach(btn => {
        if (btn !== selectedButton) {
            btn.disabled = true;
        }
    });
    
    // Emit the answer to the server
    socket.emit('submit_solo_answer', { answer: answer });
    
    resultMessageEl.textContent = 'Submitting answer...';
    resultMessageEl.style.color = getCssVar('--text-color');
}

// Initial Call: Reset UI to the 'Connecting' state when the file loads
resetGameUI();
