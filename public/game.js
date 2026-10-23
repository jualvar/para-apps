const socket = io({ autoConnect: false });
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const playerNameInput = document.getElementById('playerNameInput');
const btnJoinGame = document.getElementById('btnJoinGame');
const roleDisplay = document.getElementById('roleDisplay');
const statusDisplay = document.getElementById('statusDisplay');

let players = {};
let deadBodies = [];
let myId = null;

let MAP_WIDTH = 3000;
let MAP_HEIGHT = 3000;

// Camera object
const camera = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, ' ': false };

// --- UI Logic ---
btnJoinGame.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name.length > 0) {
        socket.connect();
        socket.emit('joinGame', name);
        lobbyScreen.classList.remove('active');
        gameScreen.classList.add('active');
        resizeCanvas();
    } else {
        alert("Please enter a name.");
    }
});

// --- Input Logic ---
document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnKill = document.getElementById('btnKill');

function setupTouch(btn, key) {
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); keys[key] = false; });
}
setupTouch(btnUp, 'w'); setupTouch(btnDown, 's'); setupTouch(btnLeft, 'a'); setupTouch(btnRight, 'd'); setupTouch(btnKill, ' ');

// --- Resize Logic ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// --- Socket Logic ---
socket.on('connect', () => { myId = socket.id; });

socket.on('initGame', (data) => {
    players = data.players;
    deadBodies = data.deadBodies;
    MAP_WIDTH = data.mapWidth;
    MAP_HEIGHT = data.mapHeight;
    updateUI();
    requestAnimationFrame(gameLoop); // Start loop only after init
});

socket.on('newPlayer', (playerInfo) => { players[playerInfo.id] = playerInfo; });
socket.on('playerDisconnected', (playerId) => { delete players[playerId]; });
socket.on('playerMoved', (playerInfo) => {
    if (players[playerInfo.id]) {
        players[playerInfo.id].x = playerInfo.x;
        players[playerInfo.id].y = playerInfo.y;
        players[playerInfo.id].facingRight = playerInfo.facingRight;
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
        roleDisplay.innerText = 'Role: Imposter';
        roleDisplay.className = 'imposter';
    } else {
        roleDisplay.innerText = 'Role: Crewmate';
        roleDisplay.className = 'crewmate';
    }

    if (!me.isAlive) {
        statusDisplay.innerText = 'STATUS: GHOST';
        statusDisplay.className = 'dead';
    } else {
        statusDisplay.innerText = 'STATUS: ALIVE';
        statusDisplay.className = '';
    }
}

// --- Drawing Logic ---

function drawMap() {
    // Fill deep space
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw Spaceship Floor (centered)
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(200, 200, MAP_WIDTH - 400, MAP_HEIGHT - 400);

    // Draw some floor tiles
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2;
    for (let x = 200; x < MAP_WIDTH - 200; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, MAP_HEIGHT-200); ctx.stroke();
    }
    for (let y = 200; y < MAP_HEIGHT - 200; y += 100) {
        ctx.beginPath(); ctx.moveTo(200, y); ctx.lineTo(MAP_WIDTH-200, y); ctx.stroke();
    }

    // Draw thick outer walls
    ctx.strokeStyle = '#a0aec0';
    ctx.lineWidth = 20;
    ctx.strokeRect(200, 200, MAP_WIDTH - 400, MAP_HEIGHT - 400);
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
    // Right Leg
    ctx.arc(12, 20, 10, 0, Math.PI);
    // Crotch
    ctx.lineTo(-2, 20);
    // Left Leg
    ctx.arc(-12, 20, 10, 0, Math.PI);
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
        if (keys.a || keys.ArrowLeft) { dx -= speed; players[myId].facingRight = false; }
        if (keys.d || keys.ArrowRight) { dx += speed; players[myId].facingRight = true; }

        if (dx !== 0 || dy !== 0) {
            players[myId].x += dx;
            players[myId].y += dy;

            // Collisions with walls
            // Allow ghosts to walk through walls, alive players cannot
            if (players[myId].isAlive) {
                players[myId].x = Math.max(220, Math.min(MAP_WIDTH - 220, players[myId].x));
                players[myId].y = Math.max(220, Math.min(MAP_HEIGHT - 230, players[myId].y));
            } else {
                players[myId].x = Math.max(20, Math.min(MAP_WIDTH - 20, players[myId].x));
                players[myId].y = Math.max(20, Math.min(MAP_HEIGHT - 20, players[myId].y));
            }

            moved = true;
        }

        if (moved) {
            socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y, facingRight: players[myId].facingRight });
        }

        // Camera Follow Logic
        camera.x = players[myId].x - canvas.width / 2;
        camera.y = players[myId].y - canvas.height / 2;

        // Clamp camera to map bounds
        camera.x = Math.max(0, Math.min(MAP_WIDTH - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(MAP_HEIGHT - canvas.height, camera.y));

        // Kill logic
        if (keys[' '] && players[myId].isImposter && players[myId].isAlive) {
            let closestId = null;
            let minDistance = 120; // Kill range

            for (const id in players) {
                if (id !== myId && players[id].isAlive && !players[id].isImposter) {
                    const dist = Math.hypot(players[myId].x - players[id].x, players[myId].y - players[id].y);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestId = id;
                    }
                }
            }

            if (closestId) {
                socket.emit('kill', closestId);
                keys[' '] = false; // Prevent rapid firing
            }
        }
    }
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
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
