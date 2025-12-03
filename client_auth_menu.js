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
        
        // CRITICAL: Initialize socket connection with user data
        socket = io(fullUrl, {
            query: { userId: userId, username: username }
        });

        // Display username immediately
        document.getElementById('username-display').textContent = username;
        document.getElementById('welcome-message').style.display = 'flex';

        // Listen for server confirmation
        socket.on('auth_successful', (data) => {
            console.log(`Socket authenticated as ${data.username}`);
            
            // 1. Initialize Multiplayer Logic (Only runs if main_game_logic.js is loaded)
            if (typeof window.initializeGameLogic === 'function') {
                window.initializeGameLogic(socket);
                console.log("Multiplayer logic initialized.");
            }
            
            // 2. Initialize Solo Game Logic (CRITICAL FIX: THIS LINE MUST BE PRESENT)
            if (typeof window.initializeSoloGameLogic === 'function') {
                window.initializeSoloGameLogic(socket);
                console.log("Solo game logic initialized.");
            }

            // UI transitions
            // Note: These IDs are only present on index.html, not simple_game.html, but the logic is harmless.
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.style.display = 'none';
            
            const modeSelectionEl = document.getElementById('mode-selection');
            if (modeSelectionEl) modeSelectionEl.style.display = 'flex'; 
            
            const logoutContainerEl = document.getElementById('logout-container');
            if (logoutContainerEl) logoutContainerEl.style.display = 'block'; 
        });

        // Handle unauthorized or invalid user ID
        socket.on('unauthorized_access', () => {
            console.error("Authentication failed. Redirecting to login.");
            window.location.href = '/login';
        });

        // Handle general server errors
        socket.on('server_error', (data) => {
             const statusEl = document.getElementById('status');
             if (statusEl) {
                 statusEl.textContent = `Server Error: ${data.message}`;
                 statusEl.style.color = 'red';
                 statusEl.style.display = 'block';
             }
        });

        // --- 2. GAME MODE BUTTON HANDLERS (for index.html) ---
        
        const simpleGameButton = document.getElementById('start-simple-game');
        const multiplayerButton = document.getElementById('start-multiplayer-button');

        // Simple Game Handler
        if (simpleGameButton) {
            simpleGameButton.addEventListener('click', () => {
                const modeSelectionEl = document.getElementById('mode-selection');
                if (modeSelectionEl) modeSelectionEl.style.display = 'none';
                
                // Navigate to the simple game page, preserving user query parameters
                window.location.href = '/simple_game' + window.location.search;
            });
        }
        
        // Multiplayer Handler 
        if (multiplayerButton) {
            multiplayerButton.addEventListener('click', () => {
                const modeSelectionEl = document.getElementById('mode-selection');
                if (modeSelectionEl) modeSelectionEl.style.display = 'none';
                
                // Show waiting status
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = '⏱️ Searching for opponent...';
                    statusEl.style.color = '#333';
                    statusEl.style.display = 'flex';
                }
                
                // Emit the correct event name to the server to start matchmaking
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
