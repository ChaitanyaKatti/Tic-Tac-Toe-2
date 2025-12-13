// State
let peer = null;
let conn = null;
let myId = "";
let myName = "";
let myColor = ""; // 'white' or 'black'
let opponentId = "";
let opponentName = "";

// We'll track whose turn it is by color. 'white' always moves first.
let turnColor = "white";
let board = ["", "", "", "", "", "", "", "", ""];
let gameActive = false;
let myRestartReady = false;
let opRestartReady = false;

// DOM Elements
const loginScreen = document.getElementById("login-screen");
const usernameInput = document.getElementById("username-input");
const peerIdInput = document.getElementById("peer-id-input");
const peerIdHint = document.getElementById("peer-id-hint");
const gameContainer = document.getElementById("game-container");
const myNameDisplay = document.getElementById("my-name");
const myIdDisplay = document.getElementById("my-id");
const gameMessage = document.getElementById("game-message");
const subMessage = document.getElementById("sub-message");
const boardDiv = document.getElementById("board");
const restartBtn = document.getElementById("restart-btn");
const scoreList = document.getElementById("score-list");
const myInfoStrip = document.getElementById("my-info-strip");
const opponentInfoStrip = document.getElementById("opponent-info-strip");
const myStripName = document.getElementById("my-strip-name");
const myStripId = document.getElementById("my-strip-id");
const opStripName = document.getElementById("op-strip-name");
const opStripId = document.getElementById("op-strip-id");

// Early load images
const whiteImg = new Image();
whiteImg.src = "./assets/white.png";
const blackImg = new Image();
blackImg.src = "./assets/black.png";

// Sounds
const clickSound = new Audio("./assets/click.ogg");
const moveSound = new Audio("./assets/move.webm");
const captureSound = new Audio("./assets/capture.webm");
const gameStartSound = new Audio("./assets/game-start.webm");
const gameEndSound = new Audio("./assets/game-end.webm");
const illegalSound = new Audio("./assets/illegal.webm");

// Get name from localstorage and set it to the input
usernameInput.value = localStorage.getItem("myName");
// Add enter key support to connect button
usernameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        startGameSession();
    }
});
peerIdInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        connectToPeer();
    }
});

function sanitizeName1(name) {
    // Remove special characters, keep space, and limit to 10 characters
    return name.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 10);
}

function sanitizeName2(name) {
    // Remove special characters, numbers, remove spaces, make all small letters, and limit to 3 characters
    return name.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 3);
}

// --- Initialization ---
function startGameSession() {
    clickSound.play();
    const name = sanitizeName1(usernameInput.value.trim());
    if (!name) return alert("Please enter your name!");
    myName = name;

    // Store name locally
    if (myName !== localStorage.getItem("myName")) { // Name has changed
        localStorage.setItem("myName", myName);
        // Generate new ID also
        const randomDigits = Math.floor(100 + Math.random() * 900);
        myId = `${sanitizeName2(name)}${randomDigits}`;
        // Store myId locally
        localStorage.setItem("myId", myId);
    }
    else { // Same name, same ID
        myId = localStorage.getItem("myId");
        if (!myId) { // Incase ID doesn't exist
            // Generate new ID also
            const randomDigits = Math.floor(100 + Math.random() * 900);
            myId = `${sanitizeName2(name)}${randomDigits}`;
            // Store myId locally
            localStorage.setItem("myId", myId);
        }
    }

    // Initialize UI
    loginScreen.style.display = "none";
    gameContainer.classList.remove("blurred-bg");
    myNameDisplay.innerText = myName;
    myIdDisplay.innerText = myId;

    // Update Strip
    myInfoStrip.style.visibility = "visible";
    myStripName.innerText = myName;
    myStripId.innerText = '#' + myId;

    initPeer();
    renderBoard();
    updateScoreBoard();
}

function initPeer() {
    peer = new Peer(myId);

    peer.on('open', (id) => {
        console.log('Peer ID is: ' + id);
    });

    peer.on('connection', (c) => {
        // Accept new connection and reset.
        if (conn) {
            conn.close();
        }
        conn = c;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error(err);
        alert("PeerJS Error: " + err.type);
    });
}

function connectToPeer() {
    clickSound.play();
    peerIdHint.innerText = "Connecting...";
    peerIdHint.style.color = "#eaff00ff";
    const remoteId = peerIdInput.value.trim();
    if (!remoteId) return alert("Enter an opponent ID");
    if (remoteId === myId) return alert("Cannot play against yourself");

    conn = peer.connect(remoteId);
    setupConnection(true);
}

function setupConnection(isInitiator = false) {
    conn.on('open', () => {
        peerIdHint.innerText = "Connected";
        peerIdHint.style.color = "#81b64c";
        opponentId = conn.peer;

        // Update Opponent Strip
        opponentInfoStrip.style.visibility = "visible";
        opStripId.innerText = '#' + opponentId;
        // Ideally we would exchange names, but for now we just show ID or "Opponent"
        // If we wanted to exchange names, we'd need to send a hello packet or similar.
        // For now, let's just use the ID as the name or "Player"
        opStripName.innerText = "Opponent"; // Placeholder until we exchange names

        if (isInitiator) {
            // Initiator decides roles. Randomly assign who is white (first).
            const iAmWhite = Math.random() < 0.5;
            const myAssignedColor = iAmWhite ? 'white' : 'black';
            const opponentAssignedColor = iAmWhite ? 'black' : 'white';

            // Send setup payload
            conn.send({
                type: 'start_game',
                yourColor: opponentAssignedColor, // They get the other color
                yourName: myName,
                turn: 'white' // White always starts
            });
            // Send name
            conn.send({
                type: 'name',
                yourName: myName,
            });
            startGame(myAssignedColor);
        }
    });

    conn.on('data', (data) => {
        handleData(data);
    });

    conn.on('close', () => {
        gameMessage.innerText = "Opponent disconnected";
        gameActive = false;
        conn = null;
        opponentInfoStrip.style.visibility = "hidden";
    });
}

function handleData(data) {
    console.log("Received:", data);
    switch (data.type) {
        case 'start_game':
            startGame(data.yourColor);
            conn.send({
                type: 'name',
                yourName: myName,
            });
            break;
        case 'name':
            opponentName = data.yourName;
            opStripName.innerText = opponentName;
            break;
        case 'move':
            handleOpponentMove(data.index);
            break;
        case 'restart_request':
            handleRestartRequest();
            break;
    }
}

// --- Game Logic ---
function startGame(assignedColor) {
    gameStartSound.play();
    myColor = assignedColor;
    turnColor = 'white'; // Always resets to white
    board = ["", "", "", "", "", "", "", "", ""];
    gameActive = true;


    updateStatus();
    renderBoard();
    restartBtn.style.display = 'none'; // Hide restart until game ends

    updateScoreBoard(); // Ensure scores are up to date
}

function handleLocalMove(index) {
    if (!gameActive) return;
    if (turnColor !== myColor) return; // Not my turn
    if (board[index] !== "") {
        illegalSound.play();
        return; // Occupied
    }

    makeMove(index, myColor);
    conn.send({ type: 'move', index: index });
}

function handleOpponentMove(index) {
    if (!gameActive) return;
    makeMove(index, turnColor); // Opponent's move is current turnColor
}

function makeMove(index, color) {
    board[index] = color;
    renderBoard();

    const winnerInfo = checkWinner(color);
    if (winnerInfo) {
        endGame(color, winnerInfo);
    } else if (board.every(cell => cell !== "")) {
        endGame('draw');
    } else {
        // Toggle turn
        moveSound.play();
        turnColor = turnColor === 'white' ? 'black' : 'white';
        updateStatus();
    }
}

function endGame(result, winningCombo = null) {
    gameEndSound.play();
    gameActive = false;
    restartBtn.style.display = 'inline-block';
    restartBtn.innerText = "Play Again";
    restartBtn.disabled = false;

    if (result === 'draw') {
        gameMessage.innerText = "It's a Draw!";
    } else {
        // Highlight winning cells
        if (winningCombo) {
            const cells = document.querySelectorAll('.cell');
            cells.forEach((cell, idx) => {
                if (winningCombo.includes(idx)) {
                    cell.classList.add('winning-cell');
                } else {
                    cell.classList.add('dimmed-cell');
                }
            });
        }

        if (result === myColor) {
            gameMessage.innerText = "You Win!";
            recordWin(myId, opponentId);
        } else {
            gameMessage.innerText = "You Lose!";
            // The winner records their own win, but for safety/sync, both can call record?
            // Better: 'recordWin' only updates local storage. 
            // The requirement says "Keep a tally... in local storage".
            // So we record based on who won.
            recordWin(opponentId, myId);
        }
    }
    subMessage.innerText = "";
}

// --- Specific Logic for Restart & Alternation ---
// "Add restart button to clear the game state and begin the game with same player"
// "First moves must alternate between player across game restarts." -> Swap colors.

function requestRestart() {
    if (myRestartReady) return; // Already clicked
    clickSound.play();
    myRestartReady = true;
    restartBtn.innerText = "Waiting for Opponent...";
    restartBtn.disabled = true;
    gameMessage.innerText = "Waiting for Opponent...";

    conn.send({ type: 'restart_request' });
    checkRestartStart();
}

function handleRestartRequest() {
    opRestartReady = true;
    if (myRestartReady) {
        checkRestartStart();
    } else {
        gameMessage.innerText = "Opponent wants to play again!";
        subMessage.innerText = "Press Play Again to restart.";
    }
}

function checkRestartStart() {
    if (myRestartReady && opRestartReady) {
        const nextColor = (myColor === 'white') ? 'black' : 'white';
        resetRestartState();
        startGame(nextColor);
    }
}

function resetRestartState() {
    myRestartReady = false;
    opRestartReady = false;
    restartBtn.innerText = "Play Again";
    restartBtn.disabled = false;
}


// --- Visuals & DOM ---
function renderBoard() {
    boardDiv.innerHTML = "";
    board.forEach((cell, index) => {
        const div = document.createElement("div");
        div.className = "cell";
        div.style.backgroundColor = index % 2 === 0 ? 'var(--cell-dark)' : 'var(--cell-light)';

        const img = document.createElement('img');
        if (cell === 'white') {
            img.src = 'assets/white.png';
        } else if (cell === 'black') {
            img.src = 'assets/black.png';
        }
        div.appendChild(img);

        div.addEventListener("click", () => handleLocalMove(index));
        boardDiv.appendChild(div);
    });
}

function updateStatus() {
    if (!gameActive) return; // Handled by endGame

    if (turnColor === myColor) {
        gameMessage.innerText = "Your Turn";
        subMessage.innerText = `You are ${myColor}`;
    } else {
        gameMessage.innerText = "Opponent's Turn";
        subMessage.innerText = `Opponent is ${turnColor === 'white' ? 'white' : 'black'}`;
    }
}


function checkWinner(color) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    // Return the winning combo array, or null
    for (let combo of wins) {
        if (combo.every(idx => board[idx] === color)) {
            return combo;
        }
    }
    return null;
}


// --- Scoring ---
// "Keep a tally of game scores for palyerid-playerid pair in local storage"

function getScoreKey(id1, id2) {
    // Sort to ensure consistency regardless of who is playing
    const sorted = [id1, id2].sort();
    return `tic-tac-toe-score-${sorted[0]}-${sorted[1]}`;
}

function recordWin(winnerId, loserId) {
    const key = getScoreKey(winnerId, loserId);
    let scoreData = JSON.parse(localStorage.getItem(key)) || { [winnerId]: 0, [loserId]: 0 };

    // Ensure both IDs exist in the object (game could be new)
    if (!scoreData[winnerId]) scoreData[winnerId] = 0;
    if (!scoreData[loserId]) scoreData[loserId] = 0;

    scoreData[winnerId]++;
    localStorage.setItem(key, JSON.stringify(scoreData));
    updateScoreBoard();
}

function updateScoreBoard() {
    // We only show score for the current opponent if connected
    if (!opponentId) return;

    const key = getScoreKey(myId, opponentId);
    const scoreData = JSON.parse(localStorage.getItem(key)) || { [myId]: 0, [opponentId]: 0 };

    scoreList.innerHTML = `
        <div class="score-entry">
            <span>${myId}</span>
            <span>${scoreData[myId] || 0}</span>
        </div>
        <div class="score-entry">
            <span>${opponentId}</span>
            <span>${scoreData[opponentId] || 0}</span>
        </div>
    `;
}

// Initial render to show something in the background
renderBoard();