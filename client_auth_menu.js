// client_auth_menu.js

// --- 1. AUTHENTICATION & INITIAL CONNECTION SETUP ---

/**
 * Gets a specific query parameter value from the current URL.
 * @param {string} name - The name of the parameter (e.g., 'userId').
 * @returns {string | null} The parameter value or null if not found.
 */
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const userId = getQueryParameter('userId');

if (!userId) {
    // 🚨 Authentication Check: If userId is missing, redirect to login page
    window.location.href = '/login';
    // Throw an error to stop further script execution on the client side
    throw new Error("Unauthenticated access. Redirecting."); 
}

const RENDER_URL = window.location.protocol + "//" + window.location.host;

// ⭐ Define the global 'socket' variable used by main_game_logic.js
// Connect to the server, passing the userId for authentication
const socket = io(RENDER_URL, {
    query: {
        userId: userId 
    }
});


// --- 2. GAME MODE FUNCTIONS (Exposed globally via the HTML button onclicks) ---

/** Hides the menu and shows the status element. */
function hideMenu() {
    const modeSelectionEl = document.getElementById('mode-selection');
    const statusEl = document.getElementById('status');
    const gameContainerEl = document.getElementById('game-container');
    
    if (modeSelectionEl) modeSelectionEl.style.display = 'none';
    if (statusEl) statusEl.style.display = 'flex';
    
    // Ensure game container centers the new status message
    if (gameContainerEl) gameContainerEl.classList.add('centered-status');
}

/** Initiates a game against the computer. */
function startComputerGame() {
    hideMenu();
    socket.emit('start_computer_game'); 
    document.getElementById('status').textContent = 'Preparing computer opponent...';
    // The main_game_logic.js resetUI(false) should handle hiding game elements.
}

/** Initiates the multiplayer matchmaking queue. */
function startMultiplayerMatch() {
    hideMenu();
    socket.emit('request_multiplayer_match'); 
    document.getElementById('status').textContent = '⏱️ Searching for live opponent...';
    // The main_game_logic.js resetUI(false) should handle hiding game elements.
}

/** Placeholder for tournament mode. */
function startTournament() {
    alert("Tournaments are not yet available. Please choose another mode!");
}


// --- 3. MENU HTML DEFINITION ---

const menuHTML = `
    <div id="mode-selection" style="display: none; flex-direction: column; width: 80%; max-width: 400px; margin-top: 5vh; text-align: center;">
        <h2 style="color: var(--primary-color); margin-bottom: 20px;">Choose Your Game</h2>
        <button class="menu-button" onclick="startComputerGame()">🤖 Start Game vs Computer</button>
        <button class="menu-button" onclick="startMultiplayerMatch()">🤝 Start Multiplayer Match</button>
        <button class="menu-button" onclick="startTournament()">🏆 Start a Tournament (Coming Soon)</button>
    </div>
`;

// --- 4. SOCKET LISTENERS FOR AUTH & MENU DISPLAY ---

socket.on('connect', () => {
    // Clean up the URL query parameter after connection
    history.replaceState(null, '', window.location.pathname); 
    document.getElementById('status').textContent = '✅ Connected. Authenticating...';
    
    // Use the function from main_game_logic.js to hide quiz elements initially
    if (typeof resetUI === 'function') {
         resetUI(false); 
    } else {
        // Fallback if main_game_logic hasn't loaded yet
        document.getElementById('game-container').classList.add('centered-status');
    }
});

socket.on('auth_successful', (data) => {
    const statusEl = document.getElementById('status');
    const gameContainerEl = document.getElementById('game-container');
    const h1El = document.querySelector('h1');
    
    document.getElementById('welcome-message').textContent = `Welcome, ${data.username}!`;
    
    // Inject the menu HTML right before the status element
    statusEl.insertAdjacentHTML('beforebegin', menuHTML); 
    
    // Hide status and show menu
    statusEl.style.display = 'none';
    document.getElementById('mode-selection').style.display = 'flex';
    
    // Center the menu container
    if (gameContainerEl) gameContainerEl.classList.add('centered-status');
    if (h1El) h1El.style.display = 'flex';
    
    // Ensure all existing game elements are hidden (relying on main_game_logic's resetUI)
    if (typeof resetUI === 'function') {
        resetUI(false); 
    }
});

socket.on('unauthorized_access', () => {
    alert("Authentication failed. Redirecting to login.");
    window.location.href = '/login';
});
