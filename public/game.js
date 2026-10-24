const socket = io({ autoConnect: false });
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const playerNameInput = document.getElementById('playerNameInput');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roleDisplay = document.getElementById('roleDisplay');
const statusDisplay = document.getElementById('statusDisplay');

let players = {};
let deadBodies = [];
let myId = null;
let gameState = 'START';

let MAP_WIDTH = 3000;
let MAP_HEIGHT = 3000;

let tasks = [];
let completedTasks = new Set();
let taskProgress = 0;
let activeTask = null;

// Camera object
const camera = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, ' ': false, 'e': false, 'E': false };

// --- UI Logic ---

function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen();
    } else if (el.mozRequestFullScreen) { /* Firefox */
        el.mozRequestFullScreen();
    } else if (el.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) { /* IE/Edge */
        el.msRequestFullscreen();
    }

    // Lock orientation if supported
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(e => console.log('Orientation lock not supported', e));
    }
}

// Background & Fullscreen Resilience Logic
const resumeOverlay = document.getElementById('resumeOverlay');
const btnResume = document.getElementById('btnResume');

document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'PLAYING') {
        // Just note that it went to background, handled mostly by fullscreen lost
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && gameState !== 'LOBBY' && myId) {
        // Lost fullscreen during active game
        resumeOverlay.style.display = 'flex';
    }
});

btnResume.addEventListener('click', () => {
    requestFullscreen();
    setTimeout(() => {
        resumeOverlay.style.display = 'none';
        resizeCanvas();
    }, 500);
});

btnCreateRoom.addEventListener('click', () => {
    requestFullscreen();
    const name = playerNameInput.value.trim();
    if (name.length > 0) {
        socket.connect();
        socket.emit('createRoom', name);
    } else {
        showNotification("Por favor ingresa un nombre.");
    }
});

btnJoinRoom.addEventListener('click', () => {
    requestFullscreen();
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (name.length === 0) {
        showNotification("Por favor ingresa un nombre.");
        return;
    }
    if (code.length === 0) {
        showNotification("Por favor ingresa un código de sala.");
        return;
    }
    socket.connect();
    socket.emit('joinRoom', { name, code });
});

socket.on('roomJoined', (roomCode) => {
    lobbyScreen.classList.remove('active');
    document.getElementById('waitingRoomScreen').style.display = 'flex';
    roomCodeDisplay.innerText = roomCode;
});

const btnStartGame = document.getElementById('btnStartGame');
if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
        socket.emit('startGame');
    });
}

socket.on('lobbyUpdate', (data) => {
    // Si regresamos desde GAME_OVER, restablecer UI
    if (gameState === 'GAME_OVER') {
        gameState = 'LOBBY';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('gameScreen').classList.remove('active');
        document.getElementById('waitingRoomScreen').style.display = 'flex';
    }

    players = data.players;
    const count = Object.keys(players).length;
    document.getElementById('playerCount').innerText = count;

    let html = '';
    for(let id in players) {
        let p = players[id];
        let hostTag = id === data.hostId ? ' <b>(Anfitrión)</b>' : '';
        html += `<div><span style="color:${p.color}">●</span> ${p.name}${hostTag}</div>`;
    }
    document.getElementById('playerList').innerHTML = html;

    if (myId === data.hostId) {
        btnStartGame.style.display = 'inline-block';
        document.getElementById('waitingMessage').style.display = 'none';

        if (count >= 1) { // Change to 3+ for real game
            btnStartGame.disabled = false;
            btnStartGame.innerText = 'INICIAR PARTIDA';
            btnStartGame.style.background = '#28a745';
        } else {
            btnStartGame.disabled = true;
            btnStartGame.innerText = 'ESPERANDO MÁS JUGADORES...';
            btnStartGame.style.background = 'gray';
        }
    } else {
        btnStartGame.style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'block';
    }
});

socket.on('gameError', (msg) => {
    showNotification(msg);
});


// --- Input Logic ---
document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });


const btnAction = document.getElementById('btnAction');
const taskProgressContainer = document.getElementById('taskProgressContainer');
const meetingModal = document.getElementById('meetingModal');
const meetingStatus = document.getElementById('meetingStatus');
const votingArea = document.getElementById('votingArea');
const voteTimer = document.getElementById('voteTimer');

let isMeeting = false;
let myVote = null;
const taskProgressBar = document.getElementById('taskProgressBar');
const taskModal = document.getElementById('taskModal');
const taskQuestion = document.getElementById('taskQuestion');
const taskAnswers = document.getElementById('taskAnswers');
const btnCloseTask = document.getElementById('btnCloseTask');
const notificationContainer = document.getElementById('notificationContainer');

function showNotification(message) {
    const notif = document.createElement('div');
    notif.className = 'game-notification';
    notif.innerText = message;
    notificationContainer.appendChild(notif);

    // Auto remove after animation (4 seconds total)
    setTimeout(() => {
        if (notif.parentNode === notificationContainer) {
            notificationContainer.removeChild(notif);
        }
    }, 4000);
}

function setupTouch(btn, key) {
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); keys[key] = false; });
}

// Nipple.js Joystick
let joystickManager = null;
let joystickMove = { x: 0, y: 0 };

function initJoystick() {
    if (joystickManager) return;
    joystickManager = nipplejs.create({
        zone: document.getElementById('joystickZone'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white'
    });

    joystickManager.on('move', (evt, data) => {
        if (data && data.vector) {
            joystickMove.x = data.vector.x;
            joystickMove.y = -data.vector.y; // nipplejs y is inverted
        }
    });

    joystickManager.on('end', () => {
        joystickMove.x = 0;
        joystickMove.y = 0;
    });
}
 setupTouch(btnAction, ' ');

btnCloseTask.addEventListener('click', () => {
    taskModal.style.display = 'none';
    activeTask = null;
});

// --- Resize Logic ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// --- Socket Logic ---
socket.on('connect', () => { myId = socket.id; });

socket.on('gameStarted', (data) => {
    gameState = 'PLAYING';
    document.getElementById('waitingRoomScreen').style.display = 'none';
    gameScreen.classList.add('active');

    players = data.players;
    MAP_WIDTH = data.mapWidth;
    MAP_HEIGHT = data.mapHeight;
    tasks = data.tasks || [];
    taskProgress = 0;
    deadBodies = [];
    completedTasks.clear();

    initJoystick();
    resizeCanvas();
    updateUI();
    requestAnimationFrame(gameLoop);
});


socket.on('meetingStarted', (data) => {
    isMeeting = true;
    myVote = null;
    startVoiceChat(); // Start voice chat when meeting starts
    players = data.players; // Updates positions to center
    meetingModal.style.display = 'flex';
    meetingStatus.innerText = '¡Discutan y Voten!';
    voteTimer.innerText = 'Tiempo restante: ' + data.time;
    btnAction.style.display = 'none';
    keys['w'] = keys['a'] = keys['s'] = keys['d'] = false;

    votingArea.innerHTML = '';

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.innerText = 'Saltar Voto';
    skipBtn.style.background = '#666';
    skipBtn.onclick = () => castVote('skip');
    votingArea.appendChild(skipBtn);

    for (let id in players) {
        const p = players[id];
        if (p.isAlive) {
            const btn = document.createElement('button');
            btn.id = 'voteBtn_' + id;
            btn.innerText = p.name;
            btn.style.color = p.color;
            btn.onclick = () => castVote(id);
            votingArea.appendChild(btn);
        }
    }
});

function castVote(targetId) {
    if (myVote) return;
    myVote = targetId;
    socket.emit('castVote', targetId);
    meetingStatus.innerText = 'Waiting for others...';
}

socket.on('meetingTimer', (time) => {
    voteTimer.innerText = 'Time left: ' + time;
});

socket.on('voteUpdate', (votes) => {
    // Optionally show who voted, for now just simple
});

socket.on('meetingEnded', (data) => {
    isMeeting = false;
    stopVoiceChat(); // Stop voice chat when meeting ends
    meetingModal.style.display = 'none';
    players = data.players;
    deadBodies = [];
    updateUI();

    if (data.tie) {
        showNotification("¡Empate! Nadie fue expulsado.");
    } else if (data.ejectedId) {
        const ejected = players[data.ejectedId];
        if (ejected) {
            const role = ejected.isImposter ? 'Judas' : 'Fiel';
            showNotification(ejected.name + " fue expulsado. Era " + role + ".");
        }
    } else {
        showNotification("Se saltó la votación. Nadie fue expulsado.");
    }
});

socket.on('updateTaskProgress', (progress) => {
    taskProgress = progress;
    updateUI();
});

socket.on('newPlayer', (playerInfo) => { players[playerInfo.id] = playerInfo; });
socket.on('playerDisconnected', (playerId) => { delete players[playerId]; });
socket.on('playerMoved', (playerInfo) => {
    if (players[playerInfo.id]) {
        players[playerInfo.id].x = playerInfo.x;
        players[playerInfo.id].y = playerInfo.y;
        players[playerInfo.id].facingRight = playerInfo.facingRight;
        players[playerInfo.id].isMoving = playerInfo.isMoving;
    }
});

socket.on('playerKilled', (data) => {
    if (players[data.targetId]) {
        players[data.targetId].isAlive = false;
    }
    deadBodies.push(data.body);
    if (data.targetId === myId) updateUI();
});


function updateUI() {
    if (!players[myId]) return;
    const me = players[myId];

    if (me.isImposter) {
        roleDisplay.innerText = 'Rol: Judas (Impostor)';
        roleDisplay.className = 'imposter';
        if(taskProgressContainer) taskProgressContainer.style.display = 'none';
    } else {
        roleDisplay.innerText = 'Rol: Fiel (Tripulante)';
        roleDisplay.className = 'crewmate';
        if(taskProgressContainer) taskProgressContainer.style.display = 'block';
        if(taskProgressBar) taskProgressBar.style.width = taskProgress + '%';
    }

    if (!me.isAlive) {
        statusDisplay.innerText = 'ESTADO: FANTASMA';
        statusDisplay.className = 'dead';
    } else {
        statusDisplay.innerText = 'ESTADO: VIVO';
        statusDisplay.className = '';
    }
}


// Map definitions
const walls = [
    { x: 400, y: 400, w: 200, h: 50 },
    { x: 400, y: 400, w: 50, h: 400 },
    { x: 800, y: 800, w: 600, h: 50 },
    { x: 1400, y: 400, w: 50, h: 450 },
    { x: 2000, y: 200, w: 50, h: 600 },
    { x: 400, y: 1200, w: 800, h: 50 },
    { x: 1600, y: 1200, w: 800, h: 50 },
    { x: 400, y: 1800, w: 50, h: 800 },
    { x: 1400, y: 1800, w: 50, h: 800 },
    { x: 2000, y: 1800, w: 50, h: 800 },
    { x: 800, y: 2200, w: 600, h: 50 },
    // A central table
    { x: 1350, y: 1350, w: 300, h: 300 }
];

function checkCollision(x, y, radius) {
    for (let w of walls) {
        // Simple AABB vs Circle collision check
        const testX = Math.max(w.x, Math.min(x, w.x + w.w));
        const testY = Math.max(w.y, Math.min(y, w.y + w.h));
        const dist = Math.hypot(x - testX, y - testY);
        if (dist < radius) return true;
    }
    return false;
}

// --- Drawing Logic ---

function drawMap() {

    // Background Water (Ocean)
    ctx.fillStyle = '#0f5e9c';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Simple wave effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 3;
    for(let i=0; i<50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random()*MAP_WIDTH, Math.random()*MAP_HEIGHT, 50 + Math.random()*50, 0, Math.PI);
        ctx.stroke();
    }

    // Draw Ark Floor (Wood)
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(200, 200, MAP_WIDTH - 400, MAP_HEIGHT - 400);

    // Draw wood plank pattern
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    const plankWidth = 80;
    for (let x = 200; x < MAP_WIDTH - 200; x += plankWidth) {
        ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, MAP_HEIGHT-200); ctx.stroke();
    }
    // Nails/texture for wood
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for(let i=0; i<200; i++) {
        ctx.beginPath();
        ctx.arc(200 + Math.random()*(MAP_WIDTH-400), 200 + Math.random()*(MAP_HEIGHT-400), 2, 0, Math.PI*2);
        ctx.fill();
    }

    // Draw thick outer walls (Dark Wood)
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(200, 150, MAP_WIDTH - 400, 50); // Top
    ctx.fillRect(200, MAP_HEIGHT - 200, MAP_WIDTH - 400, 50); // Bottom
    ctx.fillRect(150, 150, 50, MAP_HEIGHT - 300); // Left
    ctx.fillRect(MAP_WIDTH - 200, 150, 50, MAP_HEIGHT - 300); // Right

    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 4;
    ctx.strokeRect(200, 200, MAP_WIDTH - 400, MAP_HEIGHT - 400);

    // Draw internal walls with 3D depth effect (Wood)
    walls.forEach(w => {
        // Wall Top (lighter wood)
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(w.x, w.y - 40, w.w, w.h);
        ctx.strokeRect(w.x, w.y - 40, w.w, w.h);

        // Wall Face (darker wood)
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(w.x, w.y - 40 + w.h, w.w, 40);
        ctx.strokeRect(w.x, w.y - 40 + w.h, w.w, 40);
    });

    // Draw animal decorations in the corrals
    ctx.font = '60px Arial';
    ctx.textAlign = 'center';

    // Corral Inferior Izquierdo (Elefantes, etc)
    ctx.fillText("🐘", 500, 2300);
    ctx.fillText("🦒", 650, 2350);
    ctx.fillText("🦏", 800, 2250);

    // Corral Inferior Derecho (Aves / Ovejas)
    ctx.fillText("🐑", 2200, 2300);
    ctx.fillText("🕊️", 2350, 2200);
    ctx.fillText("🐄", 2500, 2350);

    // Almacen de comida
    ctx.fillText("🌾", 400, 400);
    ctx.fillText("🍎", 500, 350);
    ctx.fillText("🍇", 600, 450);

    // Emergency Button on wooden table
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath(); ctx.arc(1500, 1490, 80, 0, Math.PI*2); ctx.fill(); ctx.stroke(); // Table top
    ctx.fillStyle = '#4e342e';
    ctx.beginPath(); ctx.ellipse(1500, 1500, 80, 40, 0, 0, Math.PI); ctx.fill(); ctx.stroke(); // Table side

    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(1500, 1490, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Arial';
    ctx.fillText("EMERGENCIA", 1500, 1495);


    // Draw Tasks
    if (players[myId] && !players[myId].isImposter && tasks) {
        tasks.forEach((task, index) => {
            if (!completedTasks.has(index)) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                ctx.beginPath();
                ctx.arc(task.x, task.y, 60, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'yellow';
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.font = 'bold 20px Arial';
                ctx.fillText(task.name, task.x, task.y + 10);
            }
        });
    }
}

function drawDeadBody(body) {
    ctx.save();
    ctx.translate(body.x, body.y + 15);

    // Bottom half of body
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI, true); // half circle pointing up
    ctx.lineTo(-20, 10);
    ctx.lineTo(20, 10);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // Bone sticking out
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.roundRect(-5, -20, 10, 20, 5);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function drawPlayer(player) {
    ctx.save();
    ctx.translate(player.x, player.y);

    if (!player.facingRight) {
        ctx.scale(-1, 1);
    }

    // Ghost effect if dead
    if (!player.isAlive) {
        ctx.globalAlpha = 0.4;
        // Make ghosts float up slightly
        ctx.translate(0, Math.sin(Date.now() / 200) * 5 - 10);
    }

    const color = player.color;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';

    // Shadow
    if(player.isAlive) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 30, 20, 8, 0, 0, Math.PI*2);
        ctx.fill();
    }

    // Backpack
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-28, -10, 15, 30, 5);
    ctx.fill();
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 22, Math.PI, 0); // Head
    ctx.lineTo(22, 20); // Right side
    let isMoving = player.isMoving || false;
    let walkOffset = 0;
    if (isMoving && player.isAlive) {
        walkOffset = Math.sin(Date.now() / 100) * 5;
    }

    // Right Leg
    ctx.arc(12, 20 + walkOffset, 10, 0, Math.PI);
    // Crotch
    ctx.lineTo(-2, 20);
    // Left Leg
    ctx.arc(-12, 20 - walkOffset, 10, 0, Math.PI);
    ctx.lineTo(-22, 0); // Left side
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Visor
    ctx.fillStyle = '#9bc4e2';
    ctx.beginPath();
    ctx.roundRect(5, -10, 25, 15, 8);
    ctx.fill();
    ctx.stroke();
    // Visor highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(20, -5, 6, 2, Math.PI/8, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();

    // Name Tag (unscaled, always reads correctly)
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px Arial';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    const yOffset = player.isAlive ? -35 : -50;
    ctx.strokeText(player.name, 0, yOffset);
    ctx.fillText(player.name, 0, yOffset);
    ctx.restore();
}

function update() {
    if (players[myId]) {
        const speed = 7;
        let moved = false;
        let dx = 0; let dy = 0;

        if (keys.w || keys.ArrowUp) dy -= speed;
        if (keys.s || keys.ArrowDown) dy += speed;
        if (keys.a || keys.ArrowLeft) dx -= speed;
        if (keys.d || keys.ArrowRight) dx += speed;

        // Add joystick vector
        if (joystickMove.x !== 0 || joystickMove.y !== 0) {
            dx += joystickMove.x * speed;
            dy += joystickMove.y * speed;
        }

        if (dx < 0) players[myId].facingRight = false;
        if (dx > 0) players[myId].facingRight = true;


        if ((dx !== 0 || dy !== 0) && !isMeeting) {
            players[myId].isMoving = true;
            let nextX = players[myId].x + dx;
            let nextY = players[myId].y + dy;

            // Collisions with walls
            // Allow ghosts to walk through walls, alive players cannot
            if (players[myId].isAlive) {
                // Check outer bounds
                nextX = Math.max(220, Math.min(MAP_WIDTH - 220, nextX));
                nextY = Math.max(220, Math.min(MAP_HEIGHT - 230, nextY));

                // Check internal walls
                if (!checkCollision(nextX, players[myId].y, 25)) {
                    players[myId].x = nextX;
                }
                if (!checkCollision(players[myId].x, nextY, 25)) {
                    players[myId].y = nextY;
                }
            } else {
                players[myId].x = nextX;
                players[myId].y = nextY;
                players[myId].x = Math.max(20, Math.min(MAP_WIDTH - 20, players[myId].x));
                players[myId].y = Math.max(20, Math.min(MAP_HEIGHT - 20, players[myId].y));
            }

            moved = true;
        }

        if (moved) {
            socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y, facingRight: players[myId].facingRight, isMoving: true });
        } else if (players[myId].isMoving) {
            players[myId].isMoving = false;
            socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y, facingRight: players[myId].facingRight, isMoving: false });
        }

        // Camera Follow Logic
        camera.x = players[myId].x - canvas.width / 2;
        camera.y = players[myId].y - canvas.height / 2;

        // Clamp camera to map bounds
        camera.x = Math.max(0, Math.min(MAP_WIDTH - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(MAP_HEIGHT - canvas.height, camera.y));


        // --- Dynamic Action Button Logic ---
        let canKill = false;
        let canReport = false;
        let canEmergency = false;
        let canTask = false;

        let killTarget = null;
        let taskTarget = null;

        if (players[myId].isAlive && !isMeeting) {
            btnAction.style.display = 'block';
            btnAction.style.opacity = '0.5';
            btnAction.innerText = 'USAR';
            btnAction.style.borderColor = 'white';
            btnAction.style.boxShadow = 'none';
            btnAction.style.background = 'rgba(255,255,255,0.3)';

            // 1. Check Report
            for (let body of deadBodies) {
                if (Math.hypot(players[myId].x - body.x, players[myId].y - body.y) < 150) {
                    canReport = true;
                    break;
                }
            }

            // 2. Check Emergency (aumentamos radio a 250 por si la mesa colisiona)
            if (Math.hypot(players[myId].x - 1500, players[myId].y - 1500) < 250) {
                canEmergency = true;
            }

            // 3. Check Task (if Faithful)
            if (!players[myId].isImposter) {
                let minDistance = 100;
                if (tasks) {
                    tasks.forEach((task, index) => {
                        if (!completedTasks.has(index)) {
                            const dist = Math.hypot(players[myId].x - task.x, players[myId].y - task.y);
                            if (dist < minDistance) {
                                minDistance = dist;
                                taskTarget = task;
                                taskTarget.index = index;
                                canTask = true;
                            }
                        }
                    });
                }
            }

            // 4. Check Kill (if Judas)
            if (players[myId].isImposter) {
                let minDistance = 120;
                for (const id in players) {
                    if (id !== myId && players[id].isAlive && !players[id].isImposter) {
                        const dist = Math.hypot(players[myId].x - players[id].x, players[myId].y - players[id].y);
                        if (dist < minDistance) {
                            minDistance = dist;
                            killTarget = id;
                            canKill = true;
                        }
                    }
                }
            }

            // Prioritize button visual
            if (canReport) {
                btnAction.style.opacity = '1';
                btnAction.innerText = 'REPORTAR';
                btnAction.style.borderColor = 'orange';
                btnAction.style.boxShadow = '0 0 15px orange';
                btnAction.style.background = 'rgba(255,165,0,0.5)';
            } else if (canKill) {
                btnAction.style.opacity = '1';
                btnAction.innerText = 'MATAR';
                btnAction.style.borderColor = 'red';
                btnAction.style.boxShadow = '0 0 15px red';
                btnAction.style.background = 'rgba(255,0,0,0.5)';
            } else if (canEmergency) {
                btnAction.style.opacity = '1';
                btnAction.innerText = 'REUNIÓN';
                btnAction.style.borderColor = 'red';
                btnAction.style.boxShadow = '0 0 15px red';
                btnAction.style.background = 'rgba(255,0,0,0.5)';
            } else if (canTask) {
                btnAction.style.opacity = '1';
                btnAction.innerText = 'TAREA';
                btnAction.style.borderColor = 'lime';
                btnAction.style.boxShadow = '0 0 15px lime';
                btnAction.style.background = 'rgba(0,255,0,0.5)';
            }

            // Handle Press
            if (keys[' '] || keys['e'] || keys['E'] || keys['r'] || keys['R']) {
                if (canReport) {
                    socket.emit('reportBody');
                } else if (canKill) {
                    socket.emit('kill', killTarget);
                } else if (canEmergency) {
                    socket.emit('callEmergency');
                } else if (canTask && taskModal.style.display === 'none') {
                    openTaskModal(taskTarget, taskTarget.index);
                }
                keys[' '] = keys['e'] = keys['E'] = keys['r'] = keys['R'] = false;
            }
        }

    }
}

const biblicalQuestions = [
    { q: "¿Quién construyó el Arca?", a: ["Moisés", "Noé", "Abraham", "David"], correct: 1 },
    { q: "¿Quién abrió el Mar Rojo?", a: ["Josué", "Elías", "Noé", "Moisés"], correct: 3 },
    { q: "¿Quién derrotó a Goliat?", a: ["Saúl", "Sansón", "David", "Salomón"], correct: 2 },
    { q: "¿Qué proveyó Dios como alimento en el desierto?", a: ["Pan", "Manzanas", "Pescado", "Maná"], correct: 3 },
    { q: "¿Quién fue tragado por un gran pez?", a: ["Jonás", "Pedro", "Pablo", "Juan"], correct: 0 },
    { q: "¿Quién traicionó a Jesús por 30 monedas de plata?", a: ["Pedro", "Tomás", "Judas", "Juan"], correct: 2 },
    { q: "¿Cuántos días tomó Dios para crear el mundo?", a: ["7", "6", "3", "40"], correct: 1 },
    { q: "¿Quién fue el primer hombre?", a: ["Moisés", "Jesús", "Abraham", "Adán"], correct: 3 },
    { q: "¿Cuál es el primer libro de la Biblia?", a: ["Génesis", "Éxodo", "Mateo", "Apocalipsis"], correct: 0 },
    { q: "¿Quién usó una túnica de muchos colores?", a: ["Jacob", "David", "José", "Jesús"], correct: 2 }
];

function openTaskModal(task, taskIndex) {
    activeTask = task;
    activeTask.index = taskIndex;
    taskModal.style.display = 'flex';

    // Pick a random question
    const qIndex = Math.floor(Math.random() * biblicalQuestions.length);
    const qData = biblicalQuestions[qIndex];

    taskQuestion.innerText = qData.q;
    taskAnswers.innerHTML = '';

    qData.a.forEach((ans, index) => {
        const btn = document.createElement('button');
        btn.innerText = ans;
        btn.onclick = () => {
            if (index === qData.correct) {
                // Correct!
                socket.emit('taskCompleted');
                completedTasks.add(activeTask.index);
                taskModal.style.display = 'none';
                activeTask = null;
            } else {
                // Wrong!
                showNotification("¡Incorrecto! Inténtalo de nuevo más tarde.");
                taskModal.style.display = 'none';
                activeTask = null;
            }
        };
        taskAnswers.appendChild(btn);
    });
}


function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply camera transformation
    ctx.translate(-camera.x, -camera.y);

    drawMap();

    // Draw dead bodies
    deadBodies.forEach(body => drawDeadBody(body));

    // Draw players (dead ghosts below alive players)
    for (const id in players) {
        if (!players[id].isAlive) drawPlayer(players[id]);
    }
    for (const id in players) {
        if (players[id].isAlive) drawPlayer(players[id]);
    }

    ctx.restore();

    drawMinimap();
}

function drawMinimap() {
    if (!players[myId]) return;

    const minimapSize = 200;
    const margin = 20;
    const mapX = canvas.width - minimapSize - margin;
    const mapY = margin;

    // Minimap background (Water)
    ctx.fillStyle = 'rgba(15, 94, 156, 0.8)';
    ctx.fillRect(mapX, mapY, minimapSize, minimapSize);

    // Minimap border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX, mapY, minimapSize, minimapSize);

    // Scale factor
    const scaleX = minimapSize / MAP_WIDTH;
    const scaleY = minimapSize / MAP_HEIGHT;

    // Draw Ark (Wood) on minimap
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(mapX + (200 * scaleX), mapY + (200 * scaleY), (MAP_WIDTH - 400) * scaleX, (MAP_HEIGHT - 400) * scaleY);

    // Draw walls on minimap
    ctx.fillStyle = '#5d4037';
    walls.forEach(w => {
        ctx.fillRect(mapX + (w.x * scaleX), mapY + (w.y * scaleY), w.w * scaleX, w.h * scaleY);
    });

    // Draw tasks (if Faithful)
    if (!players[myId].isImposter) {
        ctx.fillStyle = 'yellow';
        tasks.forEach((task, index) => {
            if (!completedTasks.has(index)) {
                ctx.beginPath();
                ctx.arc(mapX + (task.x * scaleX), mapY + (task.y * scaleY), 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    // Draw my player indicator
    const me = players[myId];
    ctx.fillStyle = 'white';
    if(me.isImposter) ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(mapX + (me.x * scaleX), mapY + (me.y * scaleY), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

socket.on('gameOver', (data) => {
    gameState = 'GAME_OVER';
    document.getElementById('gameScreen').classList.remove('active');

    const goScreen = document.getElementById('gameOverScreen');
    const goWinner = document.getElementById('goWinner');
    const goReason = document.getElementById('goReason');
    const goTitle = document.getElementById('goTitle');

    goWinner.innerText = `Ganadores: ${data.winner}`;
    goReason.innerText = data.reason;

    if (data.winner === 'Fieles') {
        goWinner.style.color = '#4CAF50';
    } else {
        goWinner.style.color = '#F44336';
    }

    goScreen.style.display = 'flex';
});
