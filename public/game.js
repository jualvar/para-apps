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

let tasks = [];
let completedTasks = new Set();
let taskProgress = 0;
let activeTask = null;

// Camera object
const camera = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, ' ': false, 'e': false, 'E': false };

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
const btnTask = document.getElementById('btnTask');
const btnReport = document.getElementById('btnReport');
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

function setupTouch(btn, key) {
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); keys[key] = false; });
}
setupTouch(btnUp, 'w'); setupTouch(btnDown, 's'); setupTouch(btnLeft, 'a'); setupTouch(btnRight, 'd'); setupTouch(btnKill, ' '); setupTouch(btnTask, 'e'); setupTouch(btnReport, 'r');

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

socket.on('initGame', (data) => {
    players = data.players;
    deadBodies = data.deadBodies;
    MAP_WIDTH = data.mapWidth;
    MAP_HEIGHT = data.mapHeight;
    tasks = data.tasks || [];
    taskProgress = data.taskProgress || 0;
    updateUI();
    requestAnimationFrame(gameLoop); // Start loop only after init
});


socket.on('meetingStarted', (data) => {
    isMeeting = true;
    myVote = null;
    startVoiceChat(); // Start voice chat when meeting starts
    players = data.players; // Updates positions to center
    meetingModal.style.display = 'flex';
    meetingStatus.innerText = 'Discuss and Vote!';
    voteTimer.innerText = 'Time left: ' + data.time;
    btnKill.style.display = 'none';
    btnTask.style.display = 'none';
    btnReport.style.display = 'none';
    keys['w'] = keys['a'] = keys['s'] = keys['d'] = false;

    votingArea.innerHTML = '';

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.innerText = 'Skip Vote';
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
        alert("Tie! No one was ejected.");
    } else if (data.ejectedId) {
        const ejected = players[data.ejectedId];
        if (ejected) {
            const role = ejected.isImposter ? 'Judas' : 'Faithful';
            alert(ejected.name + " was ejected. They were " + role + ".");
        }
    } else {
        alert("Votes skipped. No one was ejected.");
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
        roleDisplay.innerText = 'Role: Judas (Traitor)';
        roleDisplay.className = 'imposter';
        if(!isMeeting) btnKill.style.display = 'block';
        if(btnTask) btnTask.style.display = 'none';
        if(taskProgressContainer) taskProgressContainer.style.display = 'none';
    } else {
        roleDisplay.innerText = 'Role: Faithful';
        roleDisplay.className = 'crewmate';
        btnKill.style.display = 'none';
        if(!isMeeting && btnTask) btnTask.style.display = 'block';
        if(taskProgressContainer) taskProgressContainer.style.display = 'block';
        if(taskProgressBar) taskProgressBar.style.width = taskProgress + '%';
    }

    // Check if near body to show report button
    let nearBody = false;
    if (me.isAlive && !isMeeting) {
        for (let body of deadBodies) {
            if (Math.hypot(me.x - body.x, me.y - body.y) < 150) {
                nearBody = true;
                break;
            }
        }
    }
    if (nearBody) {
        btnReport.style.display = 'block';
    } else {
        btnReport.style.display = 'none';
    }

    if (!me.isAlive) {
        statusDisplay.innerText = 'STATUS: GHOST';
        statusDisplay.className = 'dead';
    } else {
        statusDisplay.innerText = 'STATUS: ALIVE';
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

    // Draw internal walls
    ctx.fillStyle = '#2d3748';
    walls.forEach(w => {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Emergency Button on table
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(1500, 1500, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Arial';
    ctx.fillText("EMERGENCY", 1500, 1505);

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
        if (keys.a || keys.ArrowLeft) { dx -= speed; players[myId].facingRight = false; }
        if (keys.d || keys.ArrowRight) { dx += speed; players[myId].facingRight = true; }

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

        if ((keys['r'] || keys['R']) && players[myId].isAlive && !isMeeting) {
            keys['r'] = false; keys['R'] = false;
            socket.emit('reportBody');
        }

        // Emergency Button Logic
        if ((keys['e'] || keys['E']) && players[myId].isAlive && !isMeeting) {
            const distToButton = Math.hypot(players[myId].x - 1500, players[myId].y - 1500);
            if (distToButton < 150) {
                keys['e'] = false; keys['E'] = false;
                socket.emit('callEmergency');
            }
        }

        // Task Logic
        if ((keys['e'] || keys['E']) && !players[myId].isImposter && players[myId].isAlive && taskModal.style.display === 'none' && !isMeeting) {
            keys['e'] = false; keys['E'] = false;
            let closestTask = null;
            let closestTaskIndex = -1;
            let minDistance = 100;

            if (tasks) {
                tasks.forEach((task, index) => {
                    if (!completedTasks.has(index)) {
                        const dist = Math.hypot(players[myId].x - task.x, players[myId].y - task.y);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestTask = task;
                            closestTaskIndex = index;
                        }
                    }
                });
            }

            if (closestTask) {
                openTaskModal(closestTask, closestTaskIndex);
            }
        }
    }
}

const biblicalQuestions = [
    { q: "Who built the Ark?", a: ["Moses", "Noah", "Abraham", "David"], correct: 1 },
    { q: "Who parted the Red Sea?", a: ["Joshua", "Elijah", "Noah", "Moses"], correct: 3 },
    { q: "Who defeated Goliath?", a: ["Saul", "Samson", "David", "Solomon"], correct: 2 },
    { q: "What did God provide for food in the wilderness?", a: ["Bread", "Apples", "Fish", "Manna"], correct: 3 },
    { q: "Who was swallowed by a great fish?", a: ["Jonah", "Peter", "Paul", "John"], correct: 0 },
    { q: "Who betrayed Jesus for 30 pieces of silver?", a: ["Peter", "Thomas", "Judas", "John"], correct: 2 },
    { q: "How many days did God take to create the world?", a: ["7", "6", "3", "40"], correct: 1 },
    { q: "Who was the first man?", a: ["Moses", "Jesus", "Abraham", "Adam"], correct: 3 },
    { q: "What is the first book of the Bible?", a: ["Genesis", "Exodus", "Matthew", "Revelation"], correct: 0 },
    { q: "Who wore a coat of many colors?", a: ["Jacob", "David", "Joseph", "Jesus"], correct: 2 }
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
                alert("Incorrect! Try again later.");
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
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
