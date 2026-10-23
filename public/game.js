const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let players = {};
let myId = null;
let myRole = 'Esperando...';
let isAlive = true;

// Map dimensions
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

// Walls (x, y, w, h)
const walls = [
    { x: 500, y: 500, w: 200, h: 50 }, // Temple wall
    { x: 500, y: 500, w: 50, h: 300 }, // Temple wall
    { x: 1200, y: 800, w: 400, h: 400 }, // Market area
    { x: 800, y: 1500, w: 500, h: 50 }, // City wall
    { x: 200, y: 200, w: 100, h: 100 }, // Well
];

// Camera
let camera = { x: 0, y: 0, width: 0, height: 0 };

// Movement
const SPEED = 5;
let moveVector = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

// Keyboard controls
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// Joystick setup
const manager = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'static',
    position: { left: '75px', bottom: '75px' },
    color: 'white'
});

manager.on('move', (e, data) => {
    moveVector.x = Math.cos(data.angle.radian) * data.distance / 50; // Normalize somewhat
    moveVector.y = -Math.sin(data.angle.radian) * data.distance / 50; // Invert y for canvas
});

manager.on('end', () => {
    moveVector.x = 0;
    moveVector.y = 0;
});

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.width = canvas.width;
    camera.height = canvas.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Start Game Logic
document.getElementById('start-button').addEventListener('click', () => {
    const username = document.getElementById('username-input').value || 'Jugador';
    socket.emit('joinGame', username);
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'block';
});

// Action Button Logic
document.getElementById('action-button').addEventListener('click', () => {
    if (!myId || !players[myId] || !players[myId].isAlive) return;

    if (myRole === 'judas') {
        // Try to kill nearest disciple
        let closestId = null;
        let minDistance = 100; // Kill range

        const me = players[myId];

        for (let id in players) {
            if (id !== myId && players[id].isAlive && players[id].role !== 'judas') {
                const target = players[id];
                const dist = Math.hypot(me.x - target.x, me.y - target.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestId = id;
                }
            }
        }

        if (closestId) {
            socket.emit('kill', closestId);
        } else {
            console.log("Nadie cerca para traicionar.");
        }
    } else {
        // Disciple tasks (just a visual alert for now)
        alert('Orando... Tarea completada.');
        // In a full game, this would interact with specific task zones
    }
});

// Socket Events
socket.on('init', (data) => {
    myId = data.id;
    players = data.players;
});

socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
});

socket.on('roleAssigned', (role) => {
    myRole = role;
    document.getElementById('role-display').innerText = `Role: ${role === 'judas' ? 'Judas (Falso)' : 'Discípulo'}`;
    if (role === 'judas') {
        document.getElementById('action-button').innerText = 'Traicionar';
        document.getElementById('role-display').style.color = 'red';
    } else {
        document.getElementById('action-button').innerText = 'Orar (Tarea)';
        document.getElementById('role-display').style.color = 'blue';
    }
});

socket.on('playerDied', (id) => {
    if (id === myId) {
        isAlive = false;
        alert('Has sido traicionado. Eres un fantasma.');
    }
});


// Main Game Loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (!myId || !players[myId] || !players[myId].isAlive) return;

    let dx = 0;
    let dy = 0;

    // Keyboard
    if (keys.w || keys.ArrowUp) dy -= 1;
    if (keys.s || keys.ArrowDown) dy += 1;
    if (keys.a || keys.ArrowLeft) dx -= 1;
    if (keys.d || keys.ArrowRight) dx += 1;

    // Normalize keyboard vector if moving diagonally
    if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
    }

    // Joystick overrides keyboard if active
    if (moveVector.x !== 0 || moveVector.y !== 0) {
        dx = moveVector.x;
        dy = moveVector.y;
    }

    if (dx !== 0 || dy !== 0) {
        // Local prediction / collision detection
        const me = players[myId];
        let newX = me.x + (dx * SPEED);
        let newY = me.y + (dy * SPEED);
        let canMoveX = true;
        let canMoveY = true;

        for (let wall of walls) {
            // Check X movement
            if (newX + me.radius > wall.x && newX - me.radius < wall.x + wall.w &&
                me.y + me.radius > wall.y && me.y - me.radius < wall.y + wall.h) {
                canMoveX = false;
            }
            // Check Y movement
            if (me.x + me.radius > wall.x && me.x - me.radius < wall.x + wall.w &&
                newY + me.radius > wall.y && newY - me.radius < wall.y + wall.h) {
                canMoveY = false;
            }
        }

        let actualDx = canMoveX ? dx * SPEED : 0;
        let actualDy = canMoveY ? dy * SPEED : 0;

        if (actualDx !== 0 || actualDy !== 0) {
            socket.emit('move', { dx: actualDx, dy: actualDy });
            // Optimistic local update to prevent jitter
            me.x += actualDx;
            me.y += actualDy;
        }
    }

    // Update camera to follow player
    const me = players[myId];
    camera.x = me.x - camera.width / 2;
    camera.y = me.y - camera.height / 2;

    // Clamp camera to map bounds
    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - camera.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - camera.height));
}

function draw() {
    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context and apply camera translation
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw Map Background (Sand/Desert)
    ctx.fillStyle = '#e6c280';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw Grid (for testing movement perception)
    ctx.strokeStyle = '#d4b070';
    ctx.lineWidth = 2;
    for(let i=0; i<MAP_WIDTH; i+=100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, MAP_HEIGHT); ctx.stroke();
    }
    for(let i=0; i<MAP_HEIGHT; i+=100) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(MAP_WIDTH, i); ctx.stroke();
    }

    // Draw Walls (Stone structures)
    ctx.fillStyle = '#8c8c8c';
    ctx.strokeStyle = '#595959';
    ctx.lineWidth = 4;
    for (let wall of walls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }

    // Draw Players
    for (let id in players) {
        const p = players[id];

        if (!p.isAlive && id !== myId && players[myId].isAlive) {
            continue; // Living players can't see ghosts
        }

        ctx.fillStyle = p.isAlive ? p.color : 'rgba(200, 200, 200, 0.5)'; // Ghost color
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Name
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.radius - 10);
    }

    ctx.restore();
}

requestAnimationFrame(gameLoop);
