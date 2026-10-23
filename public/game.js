const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roleDisplay = document.getElementById('roleDisplay');
const statusDisplay = document.getElementById('statusDisplay');

let players = {};
let myId = null;

const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false,
    ' ': false // Space for kill
};

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// Mobile Touch Controls
const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnKill = document.getElementById('btnKill');

function setupTouch(btn, key) {
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    // Also support mouse clicks on the buttons for testing on desktop
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); keys[key] = false; });
}

setupTouch(btnUp, 'w');
setupTouch(btnDown, 's');
setupTouch(btnLeft, 'a');
setupTouch(btnRight, 'd');
setupTouch(btnKill, ' ');

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    updateUI();
});

socket.on('newPlayer', (playerInfo) => {
    players[playerInfo.id] = playerInfo;
});

socket.on('playerDisconnected', (playerId) => {
    delete players[playerId];
});

socket.on('playerMoved', (playerInfo) => {
    if (players[playerInfo.id]) {
        players[playerInfo.id].x = playerInfo.x;
        players[playerInfo.id].y = playerInfo.y;
    }
});

socket.on('playerKilled', (targetId) => {
    if (players[targetId]) {
        players[targetId].isAlive = false;
    }
    if (targetId === myId) {
        updateUI();
    }
});

function updateUI() {
    if (!players[myId]) return;
    const me = players[myId];

    if (me.isImposter) {
        roleDisplay.innerText = 'Imposter';
        roleDisplay.className = 'imposter';
    } else {
        roleDisplay.innerText = 'Crewmate';
        roleDisplay.className = 'crewmate';
    }

    if (!me.isAlive) {
        statusDisplay.innerText = 'DEAD (Ghost Mode)';
        statusDisplay.className = 'dead';
    } else {
        statusDisplay.innerText = 'Alive';
        statusDisplay.className = '';
    }
}

function drawPlayer(player) {
    ctx.save();
    ctx.translate(player.x, player.y);

    // Ghost effect if dead
    if (!player.isAlive) {
        ctx.globalAlpha = 0.3;
    }

    const color = player.color;

    // Draw body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 20, Math.PI, 0); // top half
    ctx.lineTo(20, 25);
    ctx.lineTo(10, 25);
    ctx.lineTo(10, 15);
    ctx.lineTo(-10, 15);
    ctx.lineTo(-10, 25);
    ctx.lineTo(-20, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw backpack
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-25, -10, 10, 25, 5);
    ctx.fill();
    ctx.stroke();

    // Draw visor
    ctx.fillStyle = '#99ccff'; // Light blue visor
    ctx.beginPath();
    ctx.roundRect(0, -5, 20, 12, 5);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#222';
    ctx.stroke();

    // Name / Status
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '12px Arial';
    if (!player.isAlive) {
        ctx.fillStyle = 'gray';
        ctx.fillText('Ghost', 0, -25);
    }

    ctx.restore();
}

function update() {
    if (players[myId] && players[myId].isAlive) {
        const speed = 5;
        let moved = false;

        let dx = 0;
        let dy = 0;

        if (keys.w || keys.ArrowUp) dy -= speed;
        if (keys.s || keys.ArrowDown) dy += speed;
        if (keys.a || keys.ArrowLeft) dx -= speed;
        if (keys.d || keys.ArrowRight) dx += speed;

        if (dx !== 0 || dy !== 0) {
            players[myId].x += dx;
            players[myId].y += dy;

            // Keep in bounds
            players[myId].x = Math.max(20, Math.min(canvas.width - 20, players[myId].x));
            players[myId].y = Math.max(20, Math.min(canvas.height - 30, players[myId].y));

            moved = true;
        }

        if (moved) {
            socket.emit('playerMovement', { x: players[myId].x, y: players[myId].y });
        }

        // Kill logic
        if (keys[' '] && players[myId].isImposter) {
            // Find closest crewmate
            let closestId = null;
            let minDistance = 100; // Kill range

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

    // Draw grid / floor
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw players (dead first, then alive)
    for (const id in players) {
        if (!players[id].isAlive) drawPlayer(players[id]);
    }
    for (const id in players) {
        if (players[id].isAlive) drawPlayer(players[id]);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
