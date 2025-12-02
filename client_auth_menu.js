// client_auth_menu.js (EDITED CONTENT)

// --- 1. AUTHENTICATION & INITIAL CONNECTION SETUP (UPDATED) ---

/** Helper to retrieve a URL query parameter. */
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const userId = getQueryParameter('userId');
// ⭐ CRITICAL ADDITION: Retrieve the username from the URL
const username = getQueryParameter('username'); 

if (!userId) {
    window.location.href = '/login';
    throw new Error("Unauthenticated access. Redirecting."); 
}

const RENDER_URL = window.location.protocol + "//" + window.location.host;

// ⭐ Define the global 'socket' variable used by main_game_logic.js
const socket = io(RENDER_URL, {
    query: {
        userId: userId,
        // ⭐ CRITICAL ADDITION: Pass the retrieved username to the server
        username: username 
    }
});


// --- 2. GAME MODE FUNCTIONS (Updated for Simple Game Redirection) ---

/** Hides the menu and shows the status element. */
function hideMenu() {
    const modeSelectionEl = document.getElementById('mode-selection');
    const statusEl = document.getElementById('status');
    const gameContainerEl = document.getElementById('game-container');
    
    if (modeSelectionEl) modeSelectionEl.style.display = 'none';
    if (statusEl) statusEl.style.display = 'flex';
    
    if (gameContainerEl) gameContainerEl.classList.add('centered-status');
}

/** 💡 UPDATED: Redirects to the simple_game.html page. */
function startSimpleGame() {
    // Preserve the userId AND username in the URL for authentication on the new page
    window.location.href = `/simple_game?userId=${userId}&username=${username}`;
}

/** Initiates the multiplayer matchmaking queue. */
function startMultiplayerMatch() {
    hideMenu();
    socket.emit('request_multiplayer_match'); 
    document.getElementById('status').textContent = '⏱️ Searching for live opponent...';
}

/** Placeholder for tournament mode. */
function startTournament() {
    alert("Tournaments are not yet available. Please choose another mode!");
}


// --- 3. MENU HTML DEFINITION (Updated Button) ---

const menuHTML = `
    <div id="mode-selection" style="display: none; flex-direction: column; width: 80%; max-width: 400px; margin-top: 5vh; text-align: center;">
        <h2 style="color: var(--primary-color); margin-bottom: 20px;">Choose Your Game</h2>
        
        <button class="menu-button" onclick="startSimpleGame()">⭐ Start Simple Game (Highest Streak)</button> 
        
        <button class="menu-button" onclick="startMultiplayerMatch()">🤝 Start Multiplayer Match</button>
        <button class="menu-button" onclick="startTournament()">🏆 Start a Tournament (Coming Soon)</button>
    </div>
`;

// --- 4. SOCKET LISTENERS FOR AUTH & MENU DISPLAY ---
// (No changes needed in this section, as the auth_successful handler already uses data.username)

socket.on('connect', () => {
    // Note: We remove the username from the URL here to keep the URL clean
    history.replaceState(null, '', window.location.pathname); 
    document.getElementById('status').textContent = '✅ Connected. Authenticating...';
    if (typeof resetUI === 'function') {
         resetUI(false); 
    } else {
        document.getElementById('game-container').classList.add('centered-status');
    }
});

socket.on('auth_successful', (data) => {
    const statusEl = document.getElementById('status');
    const gameContainerEl = document.getElementById('game-container');
    const h1El = document.querySelector('h1');
    
    // This line correctly uses the username sent back by the server
    document.getElementById('welcome-message').textContent = `Welcome, ${data.username}!`;
    
    statusEl.insertAdjacentHTML('beforebegin', menuHTML); 
    
    statusEl.style.display = 'none';
    document.getElementById('mode-selection').style.display = 'flex';
    
    if (gameContainerEl) gameContainerEl.classList.add('centered-status');
    if (h1El) h1El.style.display = 'flex';
    
    if (typeof resetUI === 'function') {
        resetUI(false); 
    }
});

socket.on('unauthorized_access', () => {
    alert("Authentication failed. Redirecting to login.");
    window.location.href = '/login';
});
