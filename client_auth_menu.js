// client_auth_menu.js - Handles Authentication Status and Game Mode Selection

let socket = null; // Initialize socket as null

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. INITIAL AUTHENTICATION CHECK ---
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const username = urlParams.get('username');
    const statusEl = document.getElementById('status'); 
    
    // UI Elements
    const modeSelectionEl = document.getElementById('mode-selection');
    const gameAreaEl = document.getElementById('game-area');

    if (userId && username) {
        
        // --- CRITICAL FIX: Ensure the correct container is visible on load ---
        if (modeSelectionEl) modeSelectionEl.style.display = 'flex';
        if (gameAreaEl) gameAreaEl.style.display = 'none';

        // Display username immediately
        document.getElementById('username-display').textContent = username;
        document.getElementById('welcome-message').style.display = 'flex';

        // --- 2. GAME MODE SELECTION ---
        const simpleGameButton = document.getElementById('start-simple-button');
        const multiplayerButton = document.getElementById('start-multiplayer-button');
        
        // Simple Game Handler (HTTP-ONLY)
        if (simpleGameButton) {
            simpleGameButton.addEventListener('click', () => {
                if (modeSelectionEl) modeSelectionEl.style.display = 'none';
                
                // Navigate to the simple game page. NO SOCKET is created here.
                window.location.href = '/simple_game' + window.location.search;
            });
        }
        
        // Multiplayer Handler (SOCKET CREATED HERE)
        if (multiplayerButton) {
            multiplayerButton.addEventListener('click', () => {
                
                // --- C. Update UI State ---
                if (modeSelectionEl) modeSelectionEl.style.display = 'none';
                // We show the game area here, but it only contains the status message initially
                if (gameAreaEl) gameAreaEl.style.display = 'flex'; 

                // Show status for connection/matchmaking
                if (statusEl) {
                    statusEl.style.display = 'flex';
                }
                
                // --- A. Create Socket Connection Only for Multiplayer (If it doesn't exist) ---
                if (!socket) {
                    console.log("Creating Socket.io connection for Multiplayer mode...");
                    // Connect using relative path and pass user data via query
                    socket = io({
                        query: { userId: userId, username: username }
                    });
                    
                    // --- B. Set up Socket Listeners ---
                    
                    // Listener 1: Server confirms authentication and readiness
                    socket.on('auth_successful', (data) => {
                        console.log(`Socket authenticated as ${data.username}. Ready for multiplayer.`);
                        
                        // CRITICAL: Initialize game logic only after socket is ready.
                        if (typeof window.initializeGameLogic === 'function') {
                            // Pass the socket to the game logic to attach all listeners
                            window.initializeGameLogic(socket); 
                            console.log("Multiplayer game listeners attached.");
                            
                            // 4. Start Matchmaking AFTER successful authentication
                            if (statusEl) {
                                statusEl.textContent = '⏱️ Searching for opponent...';
                                statusEl.style.color = '#333';
                            }
                            socket.emit('start_multiplayer'); 

                        } else {
                            console.error("Initialization failed: main_game_logic.js did not define initializeGameLogic.");
                            if (statusEl) statusEl.textContent = 'Error initializing game.';
                        }
                    });

                    // Listener 2: Handle connection errors/disconnection
                    socket.on('disconnect', () => {
                        console.log('Socket disconnected. Reconnecting...');
                        if (statusEl) {
                            statusEl.textContent = '🔴 Disconnected. Refresh to try again.';
                            statusEl.style.color = getComputedStyle(document.documentElement).getPropertyValue('--error-color').trim() || 'red';
                        }
                    });

                } else {
                    console.log("Socket already exists, restarting matchmaking flow.");
                    // If socket exists (user previously clicked), just restart matchmaking flow
                    if (statusEl) {
                        statusEl.textContent = '⏱️ Searching for opponent...';
                        statusEl.style.color = '#333';
                    }
                    socket.emit('start_multiplayer');
                }
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