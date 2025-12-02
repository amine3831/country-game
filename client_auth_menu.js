// client_auth_menu.js - Handles Authentication Status and Game Mode Selection

// NOTE: Ensure the 'socket' variable is accessible globally or defined here if not defined elsewhere.
// For simplicity in a small app, we assume 'socket' is either a global variable or defined right here.

let socket;
const hostname = window.location.hostname;
const protocol = window.location.protocol;
const port = window.location.port ? `:${window.location.port}` : '';
const fullUrl = `${protocol}//${hostname}${port}`;

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. INITIAL AUTHENTICATION CHECK ---
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const username = urlParams.get('username');

    if (userId && username) {
        // Successful login: Attempt to establish Socket.IO connection
        
        // Define socket globally for access by other scripts (like main_game_logic.js)
        socket = io(fullUrl, {
            query: { userId: userId, username: username }
        });

        // Display username immediately
        document.getElementById('username-display').textContent = username;
        document.getElementById('welcome-message').style.display = 'flex';
        document.getElementById('mode-selection').style.display = 'none'; // Keep hidden until confirmed

        // Listen for server confirmation
        socket.on('auth_successful', (data) => {
            console.log(`Socket authenticated as ${data.username}`);
            
            // Show the main menu and hide status message
            document.getElementById('status').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'flex';
            document.getElementById('logout-container').style.display = 'block'; 
        });

        // Handle unauthorized or invalid user ID
        socket.on('unauthorized_access', () => {
            console.error("Authentication failed. Redirecting to login.");
            window.location.href = '/login';
        });

        // Handle general server errors
        socket.on('server_error', (data) => {
             document.getElementById('status').textContent = `Server Error: ${data.message}`;
             document.getElementById('status').style.color = 'red';
             document.getElementById('status').style.display = 'block';
        });

        // --- 2. GAME MODE BUTTON HANDLERS ---
        
        const simpleGameButton = document.getElementById('start-simple-game');
        const multiplayerButton = document.getElementById('start-multiplayer-button');

        // Simple Game Handler
        if (simpleGameButton) {
            simpleGameButton.addEventListener('click', () => {
                document.getElementById('mode-selection').style.display = 'none';
                
                // Navigate to the simple game page
                window.location.href = '/simple_game' + window.location.search;
            });
        }
        
        // ⭐ CRITICAL MULTIPLAYER HANDLER FIX ⭐
        if (multiplayerButton) {
            multiplayerButton.addEventListener('click', () => {
                document.getElementById('mode-selection').style.display = 'none';
                
                // Show waiting status
                const statusEl = document.getElementById('status');
                statusEl.textContent = '⏱️ Searching for opponent...';
                statusEl.style.color = '#333';
                statusEl.style.display = 'flex';
                
                // 1. Emit the correct event name to the server to start matchmaking
                socket.emit('start_multiplayer'); 
                
                // 2. Load the main game UI (Assuming it's ready on index.html)
                // Note: The UI swap logic must happen here or be managed by socket listeners in main_game_logic.js
            });
        }


    } else {
        // Not logged in: Redirect to login page
        window.location.href = '/login';
    }
});

// --- 3. LOGOUT HANDLER (UNCHANGED) ---
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        // Clear query parameters (simulates session end for this testing phase)
        window.location.href = '/logout';
    });
}
