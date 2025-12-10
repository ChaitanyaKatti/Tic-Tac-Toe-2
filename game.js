
// State
let peer = null;
let conn = null;
let myId = "";
let myName = "";
let myColor = ""; // 'blue' or 'green'
let opponentId = "";
// We'll track whose turn it is by color. 'blue' always moves first.
let turnColor = "blue";
let board = ["", "", "", "", "", "", "", "", ""];
let gameActive = false;
let myRestartReady = false;
let opRestartReady = false;

// DOM Elements
const loginScreen = document.getElementById("login-screen");
const gameContainer = document.getElementById("game-container");
const myNameDisplay = document.getElementById("my-name");
const myIdDisplay = document.getElementById("my-id");
const gameMessage = document.getElementById("game-message");
const subMessage = document.getElementById("sub-message");
const boardDiv = document.getElementById("board");
const restartBtn = document.getElementById("restart-btn");
const scoreList = document.getElementById("score-list");

// --- Initialization ---
function startGameSession() {
    const nameInput = document.getElementById("username-input");
    const name = nameInput.value.trim();
    if (!name) return alert("Please enter your name!");

    myName = name;
    // Generate ID: Name + 3 random digits
    const randomDigits = Math.floor(100 + Math.random() * 900);
    myId = `${name}${randomDigits}`;

    // Initialize UI
    loginScreen.style.display = "none";
    gameContainer.style.display = "flex";
    myNameDisplay.innerText = myName;
    myIdDisplay.innerText = myId;

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
    const remoteId = document.getElementById("peerIdInput").value.trim();
    if (!remoteId) return alert("Enter an opponent ID");
    if (remoteId === myId) return alert("Cannot play against yourself");

    conn = peer.connect(remoteId);
    setupConnection(true);
}

function setupConnection(isInitiator = false) {
    conn.on('open', () => {
        console.log("Connected to: " + conn.peer);
        opponentId = conn.peer;

        if (isInitiator) {
            // Initiator decides roles. Randomly assign who is blue (first).
            const iAmBlue = Math.random() < 0.5;
            const myAssignedColor = iAmBlue ? 'blue' : 'green';
            const opponentAssignedColor = iAmBlue ? 'green' : 'blue';

            // Send setup payload
            conn.send({
                type: 'start_game',
                yourColor: opponentAssignedColor, // They get the other color
                turn: 'blue' // Blue always starts
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
    });
}

function handleData(data) {
    console.log("Received:", data);
    switch (data.type) {
        case 'start_game':
            startGame(data.yourColor);
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
    myColor = assignedColor;
    turnColor = 'blue'; // Always resets to blue
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
    if (board[index] !== "") return; // Occupied

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
        turnColor = turnColor === 'blue' ? 'green' : 'blue';
        updateStatus();
    }
}

function endGame(result, winningCombo = null) {
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
        subMessage.innerText = "Press Play Again to start.";
    }
}

function checkRestartStart() {
    if (myRestartReady && opRestartReady) {
        // Both ready. Determine colors based on PREVIOUS value.
        // We must rely on `myColor` being the value from the JUST FINISHED game.
        const nextColor = (myColor === 'blue') ? 'green' : 'blue';
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

        const img = document.createElement('img');
        if (cell === 'blue') {
            img.src = 'assets/blue.png';
        } else if (cell === 'green') {
            img.src = 'assets/green.png';
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
        subMessage.innerText = `Opponent is ${turnColor === 'blue' ? 'blue' : 'green'}`;
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