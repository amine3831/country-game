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

    if (!userId || !username) {
        window.location.href = '/login';
        return;
    }

    // CRITICAL: Initialize socket connection with user data
    socket = io(fullUrl, { query: { userId, username } });

    // Display username immediately (only exists on index.html)
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;

    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) welcomeMessage.style.display = 'flex';

    // Listen for server confirmation
    socket.on('auth_successful', (data) => {
        console.log(`Socket authenticated as ${data.username}`);

        const onIndex = !!document.getElementById("mode-selection");
        const onSoloGame = !!document.getElementById("game-container");

        // 1. Initialize Multiplayer Logic (only if on index.html)
        if (onIndex && typeof window.initializeGameLogic === 'function') {
            window.initializeGameLogic(socket);
            console.log("Multiplayer logic initialized.");
        }

        // 2. Initialize Solo Logic ONLY on simple_game.html
        if (onSoloGame && typeof window.initializeSoloGameLogic === 'function') {
            window.initializeSoloGameLogic(socket);
            console.log("Solo game logic initialized.");
        }

        // UI transitions (index.html only)
        if (onIndex) {
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.style.display = 'none';

            const modeSelectionEl = document.getElementById('mode-selection');
            if (modeSelectionEl) modeSelectionEl.style.display = 'flex';

            const logoutContainerEl = document.getElementById('logout-container');
            if (logoutContainerEl) logoutContainerEl.style.display = 'block';
        }
    });

    // Handle unauthorized or invalid user ID
    socket.on('unauthorized_access', () => {
        console.error("Authentication failed. Redirecting to login.");
        window.location.href = '/login';
    });

    // Handle server errors
    socket.on('server_error', (data) => {
        const statusEl = document.getElementById('status');
        if (!statusEl) return;
        statusEl.textContent = `Server Error: ${data.message}`;
        statusEl.style.color = 'red';
        statusEl.style.display = 'block';
    });

    // --- 2. BUTTON HANDLERS (index.html only) ---
    const simpleGameButton = document.getElementById('start-simple-game');
    const multiplayerButton = document.getElementById('start-multiplayer-button');

    // Solo Game button exists ONLY on index.html
    if (simpleGameButton) {
        simpleGameButton.addEventListener('click', () => {
            const modeSelectionEl = document.getElementById('mode-selection');
            if (modeSelectionEl) modeSelectionEl.style.display = 'none';

            window.location.href = '/simple_game' + window.location.search;
        });
    }

    // Multiplayer button exists ONLY on index.html
    if (multiplayerButton) {