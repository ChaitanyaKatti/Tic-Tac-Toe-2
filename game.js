// State
let peer = null;
let conn = null;
let myId = "";
let myName = "";
let myColor = ""; // 'white' or 'black'
let opponentId = "";
let opponentName = "";

// We'll track whose turn it is by color. 'white' always moves first.
// We'll track whose turn it is by color. 'white' always moves first.
let turnColor = "white";
// Board now stores null or { color, size }
// Initialize with nulls
let board = Array(9).fill(null);
let gameActive = false;
let myRestartReady = false;
let opRestartReady = false;

// Russian Doll Variables
const NUM_DOLLS = 7;
// Inventories: Array of booleans, true = available, false = used. Index 0 is size 1.
let myDolls = Array(NUM_DOLLS).fill(true);
let opDolls = Array(NUM_DOLLS).fill(true);
let selectedDollSize = null; // 1 to 7

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
const myDollDeck = document.getElementById("my-doll-deck");
const opDollDeck = document.getElementById("op-doll-deck");

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
    resetGameLocalState(); // Init inventories
    renderBoard();
    renderDollDecks();
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
            handleOpponentMove(data.index, data.size);
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

    resetGameLocalState();
    gameActive = true;


    updateStatus();
    renderBoard();
    renderDollDecks();
    restartBtn.style.display = 'none'; // Hide restart until game ends

    updateScoreBoard(); // Ensure scores are up to date
}

function resetGameLocalState() {
    board = Array(9).fill(null);
    myDolls = Array(NUM_DOLLS).fill(true);
    opDolls = Array(NUM_DOLLS).fill(true);
    selectedDollSize = null;
}

function handleLocalMove(index) {
    if (!gameActive) return;
    if (turnColor !== myColor) return;

    // Must handle doll selection
    if (!selectedDollSize) {
        // Maybe alert or sound?
        return;
    }

    // Validation
    const targetCell = board[index];
    if (targetCell) {
        // Gobble logic: Must be larger
        if (selectedDollSize <= targetCell.size) {
            illegalSound.play();
            return;
        }
    }
    // If empty or valid gobble:

    // Execute move
    makeMove(index, myColor, selectedDollSize);

    // Update inventory (local)
    // Note: makeMove updates the board, but inventory management needs to be tied to WHO moved.
    // We'll handle inventory update inside makeMove or separately?
    // It's cleaner to handle it here for local, but makeMove is shared.
    // Let's pass the 'isMe' flag or handle before calling makeMove?
    // Let's do it in `makeMove` by checking color?
    // Better: let's update inventory locally immediately.

    // Actually, makeMove is called by opponent too.

    conn.send({ type: 'move', index: index, size: selectedDollSize });

    // Deselect
    selectedDollSize = null;
    renderDollDecks();
}

function handleOpponentMove(index, size) {
    if (!gameActive) return;
    makeMove(index, turnColor, size);
}

function makeMove(index, color, size) {
    board[index] = { color: color, size: size };
    moveSound.play();

    // Update Inventories
    if (color === myColor) {
        myDolls[size - 1] = false;
    } else {
        opDolls[size - 1] = false;
    }

    renderBoard();
    renderDollDecks();

    const winnerInfo = checkWinner(color);
    if (winnerInfo) {
        endGame(color, winnerInfo);
        return;
    }

    // Russian Doll Tie Condition: Both players stuck.
    // Or board full is NOT a tie here, handled by turn skipping.

    // Toggle turn
    turnColor = turnColor === 'white' ? 'black' : 'white';

    // Check if next player can move
    checkTurnSkip();

    updateStatus();
}

function checkTurnSkip() {
    // Check if current turnColor has ANY valid moves
    const currentInventory = (turnColor === myColor) ? myDolls : opDolls;
    const availableSizes = [];
    currentInventory.forEach((avail, idx) => {
        if (avail) availableSizes.push(idx + 1);
    });

    if (availableSizes.length === 0) {
        // No dolls left. Skip turn? 
        // "A Player's turn is skipped if don't have any dolls left."
        // Check if OTHER player also has no moves -> Tie.
        handleSkip(availableSizes);
        return;
    }

    // Check if any available size can be placed on ANY cell
    let canMove = false;
    for (let i = 0; i < 9; i++) {
        const cell = board[i];
        if (!cell) {
            canMove = true;
            break;
        }
        // If cell occupied, can we gobble?
        // We need just ONE doll that is larger than cell.size
        // Since availableSizes is sorted (1..7), checking largest is enough?
        // Actually we just need to find if there is ANY s in availableSizes > cell.size
        const largestAvailable = availableSizes[availableSizes.length - 1];
        if (largestAvailable > cell.size) {
            canMove = true;
            break;
        }
    }

    if (!canMove) {
        handleSkip(availableSizes);
    }
}

function handleSkip(availableSizes) {
    // Skip turn
    // Check if BOTH are skipped -> Tie
    // We need a state to track consecutive skips?
    // Or just check if the NEXT player (who just played) can move?
    // If I just played, and now it's opponent's turn. If they can't move, we skip back to ME.
    // If I ALSO can't move, then TIE.

    console.log(`Skipping turn for ${turnColor}`);

    // Use a temporary flag or just check immediately for the next player?
    // Let's toggle turn and check again. Recursion risk if not careful.

    // Let's invoke a special status message
    // And toggle turn back.

    const skippedColor = turnColor;
    turnColor = turnColor === 'white' ? 'black' : 'white';

    // Check if the OTHER player (who just got the turn back) can move?
    const nextInventory = (turnColor === myColor) ? myDolls : opDolls;
    const nextAvailSizes = []; // ... duplicate logic, should extract
    nextInventory.forEach((avail, idx) => { if (avail) nextAvailSizes.push(idx + 1); });

    let nextCanMove = false;
    if (nextAvailSizes.length > 0) {
        for (let i = 0; i < 9; i++) {
            const cell = board[i];
            if (!cell) { nextCanMove = true; break; }
            if (nextAvailSizes[nextAvailSizes.length - 1] > cell.size) { nextCanMove = true; break; }
        }
    }

    if (!nextCanMove) {
        // Both stuck
        endGame('draw');
    } else {
        // Only one skipped.
        // We need to inform user.
        // Alert might be annoying, let's put it in submessage
        // But updateStatus overwrites.
        // NOTE: If we toggle turn here, updateStatus will be called after this function returns (in makeMove)
        // Wait, makeMove calls checkTurnSkip.
        // If checkTurnSkip changes turnColor, then makeMove's subsequent updateStatus might show the NEW turn.
        // We want to show "Opponent skipped!" or "You skipped!"

        // Let's handle this in updateStatus or add a notification.
        // We can leverage subMessage in updateStatus.
        // Adding a global 'lastActionWasSkip' flag?

        // Simple approach:
        // Just toggle and let the game continue. The status message will say "Your Turn" again immediately.
        // Maybe add a flash message?

        setTimeout(() => {
            alert(`${skippedColor} has no moves and skips turn!`);
        }, 100);
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

        // Background color logic could be enhanced but sticking to basic
        div.style.backgroundColor = index % 2 === 0 ? 'var(--cell-dark)' : 'var(--cell-light)';

        if (cell) {
            const img = document.createElement('img');
            img.dataset.size = cell.size; // For CSS scaling
            if (cell.color === 'white') {
                img.src = 'assets/white.png';
            } else if (cell.color === 'black') {
                img.src = 'assets/black.png';
            }
            div.appendChild(img);

            const num = document.createElement('span');
            num.className = 'cell-num';
            num.innerText = cell.size;
            div.appendChild(num);
        }

        div.addEventListener("click", () => handleLocalMove(index));
        boardDiv.appendChild(div);
    });
}

function renderDollDecks() {
    renderDeck(myDollDeck, myColor, myDolls, true);
    // Opponent deck: we don't know their color until game starts, handling fallback
    const opColor = (myColor === 'white') ? 'black' : 'white';
    renderDeck(opDollDeck, opColor, opDolls, false);
}

function renderDeck(container, color, inventory, isMe) {
    container.innerHTML = "";
    // Render 1 to 7
    for (let i = 0; i < NUM_DOLLS; i++) {
        const size = i + 1;
        const available = inventory[i];

        const div = document.createElement("div");
        div.className = "doll-item";
        div.dataset.size = size;

        if (!available) {
            div.classList.add("used");
        }

        // Highlight selection for me
        if (isMe && available && selectedDollSize === size) {
            div.classList.add("selected");
        }

        const img = document.createElement('img');
        // If color isn't set yet (pre-game), defaults might be needed, but usually myColor is empty string initially?
        // Let's handle empty color gracefully or just show nothing? 
        // Actually, startGame sets colors. Before that, maybe just show placeholders or nothing.
        // But for "deck", we need images.

        let imgSrc = "";
        if (color === 'white') imgSrc = "assets/white.png";
        else if (color === 'black') imgSrc = "assets/black.png";
        else {
            // Default or hidden if no color assigned yet
            // Maybe show gray? Or just white/black based on some default?
            // Let's play safe: if no color, don't render img? Or assume White for P1 if not started?
            // Actually, updateStatus logic implies colors are known.
            // If game not active, maybe empty?
            if (isMe && myColor) imgSrc = `assets/${myColor}.png`;
        }

        if (imgSrc) {
            img.src = imgSrc;
            div.appendChild(img);
        }

        const numSpan = document.createElement('span');
        numSpan.className = 'doll-num';
        numSpan.innerText = size;
        div.appendChild(numSpan);

        if (isMe && available) {
            div.addEventListener("click", () => {
                if (!gameActive) return;
                if (turnColor !== myColor) return;
                selectDoll(size);
            });
        }

        container.appendChild(div);
    }
}

function selectDoll(size) {
    clickSound.play();
    if (selectedDollSize === size) {
        selectedDollSize = null; // Deselect
    } else {
        selectedDollSize = size;
    }
    renderDollDecks(); // Re-render to show selection
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
        // Must check if cell is not null AND color matches
        if (combo.every(idx => board[idx] && board[idx].color === color)) {
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