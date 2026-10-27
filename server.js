const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

const colors = ['#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ef7d0d', '#f5f557', '#3f474e', '#d6e0f0', '#6b2fbb', '#38fedc'];

// Map bounds (much larger now)
const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;

const walls = [
    // Borde exterior de la nave (El Arca)
    { x: 200, y: 200, w: 3600, h: 50 }, // Arriba
    { x: 200, y: 3750, w: 3600, h: 50 }, // Abajo
    { x: 200, y: 200, w: 50, h: 3600 }, // Izquierda
    { x: 3750, y: 200, w: 50, h: 3600 }, // Derecha

    // Zona del Botón de Emergencia (Mesa central)
    { x: 1350, y: 1350, w: 300, h: 300 }, // Centro (Mesa)

    // Sala Superior Izquierda (Almacén de Comida)
    { x: 250, y: 800, w: 600, h: 50 }, // Pared inferior almacén
    { x: 850, y: 250, w: 50, h: 300 }, // Pared derecha almacén (con puerta abajo)
    { x: 850, y: 650, w: 50, h: 200 }, // Pared derecha almacén continuación

    // Sala Superior Derecha (Navegación / Timón)
    { x: 2150, y: 800, w: 600, h: 50 }, // Pared inferior navegación
    { x: 2100, y: 250, w: 50, h: 300 }, // Pared izq navegación
    { x: 2100, y: 650, w: 50, h: 200 }, // Pared izq navegación continuación

    // Sala Inferior Izquierda (Corral de Animales Grandes)
    { x: 250, y: 2100, w: 800, h: 50 }, // Pared superior corral
    { x: 1050, y: 2100, w: 50, h: 300 }, // Pared derecha corral
    { x: 1050, y: 2500, w: 50, h: 250 }, // Pared derecha corral cont.

    // Sala Inferior Derecha (Corral de Aves / Sala de descanso)
    { x: 1950, y: 2100, w: 800, h: 50 }, // Pared superior aves
    { x: 1900, y: 2100, w: 50, h: 300 }, // Pared izq aves
    { x: 1900, y: 2500, w: 50, h: 250 }, // Pared izq aves cont.

    // Pasillo Central Vertical
    { x: 1100, y: 800, w: 50, h: 400 }, 
    { x: 1850, y: 800, w: 50, h: 400 },
    { x: 1100, y: 1800, w: 50, h: 300 },
    { x: 1850, y: 1800, w: 50, h: 300 }
];

function checkLineOfSight(x1, y1, x2, y2) {
    for (let w of walls) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        if (maxX >= w.x && minX <= w.x + w.w && maxY >= w.y && minY <= w.y + w.h) {
            return false;
        }
    }
    return true;
}

const ROOM_TASKS = [
    { x: 1500, y: 500, name: "Reparar el Timón" }, 
    { x: 500, y: 500, name: "Organizar Comida" }, 
    { x: 2500, y: 500, name: "Navegar el Arca" }, 
    { x: 500, y: 2400, name: "Alimentar Elefantes" }, 
    { x: 2500, y: 2400, name: "Limpiar Jaulas" }, 
    { x: 1500, y: 2500, name: "Contar los Animales" }, 
    { x: 1500, y: 1100, name: "Barrer Pasillo" }
];

// Room Management
const rooms = {};

function createRoomData() {
    return {
        players: {},
        deadBodies: [],
        gameState: 'LOBBY',
        hostId: null,
        globalTaskProgress: 0,
        MAX_TASKS: 1,
        colorIndex: 0,
        isMeeting: false,
        meetingTimer: null,
        votes: {},
        meetingTimeLeft: 0,
        meetingInterval: null
    };
}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for(let i=0; i<4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function startMeeting(roomCode, callerId) {
    const room = rooms[roomCode];
    if (!room || room.isMeeting) return;
    
    room.isMeeting = true;
    room.votes = {};
    room.meetingTimeLeft = 30;
    
    // Move everyone to center
    for (let id in room.players) {
        if (room.players[id].isAlive) {
            room.players[id].x = 1500 + Math.cos(Math.random()*Math.PI*2) * 250;
            room.players[id].y = 1500 + Math.sin(Math.random()*Math.PI*2) * 250;
        }
    }
    
    io.to(roomCode).emit('meetingStarted', { callerId, time: room.meetingTimeLeft, players: room.players });
    
    room.meetingInterval = setInterval(() => {
        room.meetingTimeLeft--;
        io.to(roomCode).emit('meetingTimer', room.meetingTimeLeft);
        if (room.meetingTimeLeft <= 0) {
            endMeeting(roomCode);
        }
    }, 1000);
}

function endMeeting(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.isMeeting) return;
    
    room.isMeeting = false;
    clearInterval(room.meetingInterval);
    
    const voteCounts = {};
    let maxVotes = 0;
    let ejectedId = null;
    let tie = false;
    
    for (let id in room.votes) {
        const votedFor = room.votes[id];
        if (votedFor !== 'skip') {
            voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
            if (voteCounts[votedFor] > maxVotes) {
                maxVotes = voteCounts[votedFor];
                ejectedId = votedFor;
                tie = false;
            } else if (voteCounts[votedFor] === maxVotes) {
                tie = true;
            }
        }
    }
    
    if (ejectedId && !tie) {
        if (room.players[ejectedId]) {
            room.players[ejectedId].isAlive = false;
        }
    } else {
        ejectedId = null;
    }
    
    room.deadBodies = [];
    
    io.to(roomCode).emit('meetingEnded', { ejectedId, players: room.players, tie });
    
    setTimeout(() => {
        checkWinCondition(roomCode);
    }, 1000);
}

function checkWinCondition(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.gameState !== 'PLAYING') return;

    let faithfulAlive = 0;
    let imposterAlive = 0;

    for (let id in room.players) {
        if (room.players[id].isAlive) {
            if (room.players[id].isImposter) {
                imposterAlive++;
            } else {
                faithfulAlive++;
            }
        }
    }

    if (imposterAlive === 0 || room.globalTaskProgress >= room.MAX_TASKS) {
        room.gameState = 'GAME_OVER';
        io.to(roomCode).emit('gameOver', { winner: 'Fieles', reason: imposterAlive === 0 ? 'Judas fue expulsado' : 'Todas las tareas completadas' });
        resetGameToLobby(roomCode);
    } else if (imposterAlive >= faithfulAlive) {
        room.gameState = 'GAME_OVER';
        io.to(roomCode).emit('gameOver', { winner: 'Judas', reason: 'Judas eliminó a la mayoría' });
        resetGameToLobby(roomCode);
    }
}

function resetGameToLobby(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    setTimeout(() => {
        room.gameState = 'LOBBY';
        room.deadBodies = [];
        room.globalTaskProgress = 0;
        
        for (let id in room.players) {
            room.players[id].isAlive = true;
            room.players[id].isImposter = false;
        }
        
        io.to(roomCode).emit('lobbyUpdate', { players: room.players, hostId: room.hostId });
    }, 8000);
}

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);
    let currentRoom = null;

    socket.on('createRoom', (playerName) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = createRoomData();
        const room = rooms[roomCode];
        
        currentRoom = roomCode;
        socket.join(roomCode);
        
        const assignedColor = colors[room.colorIndex % colors.length];
        room.colorIndex++;
        
        room.players[socket.id] = {
            id: socket.id,
            name: playerName || `Jugador${Math.floor(Math.random()*1000)}`,
            x: 600 + (Math.random() * 200 - 100),
            y: 600 + (Math.random() * 200 - 100),
            color: assignedColor,
            isImposter: false,
            isAlive: true,
            facingRight: true
        };
        
        room.hostId = socket.id;
        socket.emit('roomJoined', roomCode);
        io.to(roomCode).emit('lobbyUpdate', { players: room.players, hostId: room.hostId });
    });

    socket.on('joinRoom', (data) => {
        const roomCode = data.code;
        const playerName = data.name;
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('gameError', 'Sala no encontrada.');
            return;
        }
        if (room.gameState !== 'LOBBY') {
            socket.emit('gameError', 'El juego ya ha comenzado en esta sala.');
            return;
        }
        
        currentRoom = roomCode;
        socket.join(roomCode);
        
        const assignedColor = colors[room.colorIndex % colors.length];
        room.colorIndex++;
        
        room.players[socket.id] = {
            id: socket.id,
            name: playerName || `Jugador${Math.floor(Math.random()*1000)}`,
            x: 600 + (Math.random() * 200 - 100),
            y: 600 + (Math.random() * 200 - 100),
            color: assignedColor,
            isImposter: false,
            isAlive: true,
            facingRight: true
        };
        
        if (Object.keys(room.players).length === 1) {
            room.hostId = socket.id;
        }
        
        socket.emit('roomJoined', roomCode);
        io.to(roomCode).emit('lobbyUpdate', { players: room.players, hostId: room.hostId });
    });

    socket.on('startGame', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        
        if (socket.id === room.hostId && room.gameState === 'LOBBY') {
            const playerKeys = Object.keys(room.players);
            if (playerKeys.length < 1) { // change to higher later
                return;
            }

            room.gameState = 'PLAYING';

            const imposterIndex = Math.floor(Math.random() * playerKeys.length);
            let faithfulCount = 0;
            playerKeys.forEach((key, index) => {
                room.players[key].isImposter = (index === imposterIndex);
                if (!room.players[key].isImposter) faithfulCount++;
            });

            room.MAX_TASKS = faithfulCount * 3;
            room.globalTaskProgress = 0;
            room.deadBodies = [];

            io.to(currentRoom).emit('gameStarted', {
                players: room.players,
                tasks: ROOM_TASKS,
                mapWidth: MAP_WIDTH,
                mapHeight: MAP_HEIGHT
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                
                const remainingKeys = Object.keys(room.players);
                if (remainingKeys.length === 0) {
                    delete rooms[currentRoom]; // Clean up empty room
                } else {
                    if (socket.id === room.hostId) {
                        room.hostId = remainingKeys[0];
                    }
                    if (room.gameState === 'LOBBY') {
                        io.to(currentRoom).emit('lobbyUpdate', { players: room.players, hostId: room.hostId });
                    } else {
                        io.to(currentRoom).emit('playerDisconnected', socket.id);
                        checkWinCondition(currentRoom); // Check win if someone disconnected during game
                    }
                }
            }
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        if (room.players[socket.id] && room.players[socket.id].isAlive) {
            room.players[socket.id].x = movementData.x;
            room.players[socket.id].y = movementData.y;
            room.players[socket.id].facingRight = movementData.facingRight;
            room.players[socket.id].isMoving = movementData.isMoving;
            
            socket.broadcast.to(currentRoom).emit('playerMoved', room.players[socket.id]);
        }
    });

    socket.on('kill', (targetId) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        const killer = room.players[socket.id];
        const victim = room.players[targetId];

        if (killer && killer.isImposter && killer.isAlive) {
            if (victim && victim.isAlive && !victim.isImposter) {
                const dist = Math.hypot(killer.x - victim.x, killer.y - victim.y);
                if (dist < 120 && checkLineOfSight(killer.x, killer.y, victim.x, victim.y)) {
                    victim.isAlive = false;

                    const body = {
                        id: `body_${Date.now()}_${targetId}`,
                        x: victim.x,
                        y: victim.y,
                        color: victim.color
                    };
                    room.deadBodies.push(body);

                    io.to(currentRoom).emit('playerKilled', { targetId: targetId, body: body });
                    checkWinCondition(currentRoom);
                }
            }
        }
    });

    socket.on('reportBody', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        const player = room.players[socket.id];
        if (player && player.isAlive && !room.isMeeting) {
            let nearBody = false;
            for (let body of room.deadBodies) {
                if (Math.hypot(player.x - body.x, player.y - body.y) < 150) {
                    nearBody = true;
                    break;
                }
            }
            if (nearBody) {
                startMeeting(currentRoom, socket.id);
            }
        }
    });
    
    socket.on('callEmergency', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        const player = room.players[socket.id];
        if (player && player.isAlive && !room.isMeeting) {
            if (Math.hypot(player.x - 1500, player.y - 1500) < 300) {
                startMeeting(currentRoom, socket.id);
            }
        }
    });
    
    // Voice Chat Signaling
    socket.on('joinVoice', () => {
        if(currentRoom) socket.broadcast.to(currentRoom).emit('userJoinedVoice', socket.id);
    });
    
    socket.on('voiceSignal', (data) => {
        if(currentRoom) io.to(data.to).emit('voiceSignal', { from: socket.id, ...data });
    });

    socket.on('castVote', (targetId) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        if (room.isMeeting && room.players[socket.id] && room.players[socket.id].isAlive && !room.votes[socket.id]) {
            room.votes[socket.id] = targetId;
            io.to(currentRoom).emit('voteUpdate', room.votes);
            
            let allVoted = true;
            for (let id in room.players) {
                if (room.players[id].isAlive && !room.votes[id]) {
                    allVoted = false;
                    break;
                }
            }
            if (allVoted) endMeeting(currentRoom);
        }
    });

    socket.on('taskCompleted', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        const player = room.players[socket.id];
        if (player && player.isAlive && !player.isImposter) {
            room.globalTaskProgress++;
            if (room.globalTaskProgress >= room.MAX_TASKS) {
                room.globalTaskProgress = room.MAX_TASKS;
                io.to(currentRoom).emit('updateTaskProgress', 100);
                checkWinCondition(currentRoom);
            } else {
                io.to(currentRoom).emit('updateTaskProgress', (room.globalTaskProgress / room.MAX_TASKS) * 100);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
