// client_auth_menu.js - Handles Authentication Status and Game Mode Selection

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
        
        socket = io(fullUrl, {
            query: { userId: userId, username: username }
        });

        // Display username immediately
        document.getElementById('username-display').textContent = username;
        document.getElementById('welcome-message').style.display = 'flex';
        // The mode-selection display state relies on your CSS/HTML initial state here

        // Listen for server confirmation
        socket.on('auth_successful', (data) => {
            console.log(`Socket authenticated as ${data.username}`);
            
            // This is the CRITICAL block that was causing the regression
            document.getElementById('status').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'flex'; // This line might have been missing or styled incorrectly
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
        
        // Multiplayer Handler (This contains the working 'start_multiplayer' fix)
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
