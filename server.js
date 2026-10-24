const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

const players = {};
let deadBodies = [];
const colors = ['#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ef7d0d', '#f5f557', '#3f474e', '#d6e0f0', '#6b2fbb', '#38fedc'];
let colorIndex = 0;

// Map bounds (much larger now)
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

const walls = [
    // Borde exterior de la nave (El Arca)
    { x: 200, y: 200, w: 2600, h: 50 }, // Arriba
    { x: 200, y: 2750, w: 2600, h: 50 }, // Abajo
    { x: 200, y: 200, w: 50, h: 2600 }, // Izquierda
    { x: 2750, y: 200, w: 50, h: 2600 }, // Derecha

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
    // Basic line intersection check against all walls
    for (let w of walls) {
        // Just checking if the line intersects the AABB of the wall
        // A very simple implementation for now to prevent killing through walls
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        if (maxX >= w.x && minX <= w.x + w.w && maxY >= w.y && minY <= w.y + w.h) {
            // It intersects the bounding box of the wall, we'll count it as blocked for simplicity
            return false;
        }
    }
    return true;
}


let gameState = 'LOBBY';
let hostId = null;

// Task System
let globalTaskProgress = 0;
let MAX_TASKS = 1; // Default
const tasks = [
    { x: 1500, y: 500, name: "Reparar el Timón" }, // Pasillo superior
    { x: 500, y: 500, name: "Organizar Comida" }, // Almacen
    { x: 2500, y: 500, name: "Navegar el Arca" }, // Navegacion
    { x: 500, y: 2400, name: "Alimentar Elefantes" }, // Corral inferior izq
    { x: 2500, y: 2400, name: "Limpiar Jaulas" }, // Corral inferior der
    { x: 1500, y: 2500, name: "Contar los Animales" }, // Pasillo inferior
    { x: 1500, y: 1100, name: "Barrer Pasillo" }
];


let isMeeting = false;
let meetingTimer = null;
let votes = {};
let meetingTimeLeft = 0;
let meetingInterval = null;

function startMeeting(callerId) {
    if (isMeeting) return;
    isMeeting = true;
    votes = {};
    meetingTimeLeft = 30;

    // Move everyone to center
    for (let id in players) {
        if (players[id].isAlive) {
            players[id].x = 1500 + Math.cos(Math.random()*Math.PI*2) * 250;
            players[id].y = 1500 + Math.sin(Math.random()*Math.PI*2) * 250;
        }
    }

    io.emit('meetingStarted', { callerId, time: meetingTimeLeft, players });

    meetingInterval = setInterval(() => {
        meetingTimeLeft--;
        io.emit('meetingTimer', meetingTimeLeft);
        if (meetingTimeLeft <= 0) {
            endMeeting();
        }
    }, 1000);
}

function endMeeting() {
    if (!isMeeting) return;
    isMeeting = false;
    clearInterval(meetingInterval);

    // Tally votes
    const voteCounts = {};
    let maxVotes = 0;
    let ejectedId = null;
    let tie = false;

    for (let id in votes) {
        const votedFor = votes[id];
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
        if (players[ejectedId]) {
            players[ejectedId].isAlive = false;
        }
    } else {
        ejectedId = null; // No one ejected
    }

    // Clear bodies
    deadBodies = [];

    io.emit('meetingEnded', { ejectedId, players, tie });
}

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('joinGame', (playerName) => {
      if (gameState !== 'LOBBY') {
          socket.emit('gameError', 'El juego ya ha comenzado.');
          return;
      }

      const assignedColor = colors[colorIndex % colors.length];
      colorIndex++;

      // In lobby, everyone starts as alive, no roles yet
      players[socket.id] = {
        id: socket.id,
        name: playerName || `Jugador${Math.floor(Math.random()*1000)}`,
        x: 600 + (Math.random() * 200 - 100),
        y: 600 + (Math.random() * 200 - 100),
        color: assignedColor,
        isImposter: false,
        isAlive: true,
        facingRight: true
      };

      if (Object.keys(players).length === 1) {
          hostId = socket.id;
      }

      io.emit('lobbyUpdate', {
          players: players,
          hostId: hostId
      });
  });

  socket.on('startGame', () => {
      if (socket.id === hostId && gameState === 'LOBBY') {
          const playerKeys = Object.keys(players);
          if (playerKeys.length < 1) { // change to 3 or 4 for real games
              return;
          }

          gameState = 'PLAYING';

          // Assign roles
          const imposterIndex = Math.floor(Math.random() * playerKeys.length);
          let faithfulCount = 0;
          playerKeys.forEach((key, index) => {
              players[key].isImposter = (index === imposterIndex);
              if (!players[key].isImposter) faithfulCount++;
          });

          // Calc total tasks
          MAX_TASKS = faithfulCount * 3; // 3 tasks per faithful
          globalTaskProgress = 0;
          deadBodies = [];

          io.emit('gameStarted', {
              players: players,
              tasks: tasks,
              mapWidth: MAP_WIDTH,
              mapHeight: MAP_HEIGHT
          });
      }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    if (players[socket.id]) {
        delete players[socket.id];
        if (socket.id === hostId && Object.keys(players).length > 0) {
            hostId = Object.keys(players)[0]; // Reassign host
        }

        if (gameState === 'LOBBY') {
            io.emit('lobbyUpdate', { players: players, hostId: hostId });
        } else {
            io.emit('playerDisconnected', socket.id);
        }
    }
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id] && players[socket.id].isAlive) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].facingRight = movementData.facingRight;
      players[socket.id].isMoving = movementData.isMoving;

      // We don't need to send the whole object every tick, just position is fine for optimization,
      // but sending whole object is easier for this scale.
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('kill', (targetId) => {
      const killer = players[socket.id];
      const victim = players[targetId];

      if (killer && killer.isImposter && killer.isAlive) {
          if (victim && victim.isAlive && !victim.isImposter) {
             // Distance check (120px range)
             const dist = Math.hypot(killer.x - victim.x, killer.y - victim.y);
             if (dist < 120 && checkLineOfSight(killer.x, killer.y, victim.x, victim.y)) {
                 victim.isAlive = false;

                 // Create a dead body object
                 const body = {
                     id: `body_${Date.now()}_${targetId}`,
                     x: victim.x,
                     y: victim.y,
                     color: victim.color
                 };
                 deadBodies.push(body);

                 // Notify everyone
                 io.emit('playerKilled', { targetId: targetId, body: body });
                 checkWinCondition();
             }
          }
      }
  });


  socket.on('reportBody', () => {
      const player = players[socket.id];
      if (player && player.isAlive && !isMeeting) {
          // Check if near any body
          let nearBody = false;
          for (let body of deadBodies) {
              if (Math.hypot(player.x - body.x, player.y - body.y) < 150) {
                  nearBody = true;
                  break;
              }
          }
          if (nearBody) {
              startMeeting(socket.id);
          }
      }
  });

  socket.on('callEmergency', () => {
      const player = players[socket.id];
      if (player && player.isAlive && !isMeeting) {
          if (Math.hypot(player.x - 1500, player.y - 1500) < 300) {
              startMeeting(socket.id);
          }
      }
  });

  // Voice Chat Signaling
  socket.on('joinVoice', () => {
      socket.broadcast.emit('userJoinedVoice', socket.id);
  });

  socket.on('voiceSignal', (data) => {
      io.to(data.to).emit('voiceSignal', { from: socket.id, ...data });
  });

  socket.on('castVote', (targetId) => {
      if (isMeeting && players[socket.id] && players[socket.id].isAlive && !votes[socket.id]) {
          votes[socket.id] = targetId;
          io.emit('voteUpdate', votes);

          // Check if everyone voted
          let allVoted = true;
          for (let id in players) {
              if (players[id].isAlive && !votes[id]) {
                  allVoted = false;
                  break;
              }
          }
          if (allVoted) endMeeting();
      }
  });

  socket.on('taskCompleted', () => {
      const player = players[socket.id];
      if (player && player.isAlive && !player.isImposter) {
          globalTaskProgress++;
          if (globalTaskProgress >= MAX_TASKS) {
              globalTaskProgress = MAX_TASKS;
              io.emit('updateTaskProgress', 100);
              checkWinCondition();
          } else {
              io.emit('updateTaskProgress', (globalTaskProgress / MAX_TASKS) * 100);
          }
      }
  });
});

function checkWinCondition() {
    if (gameState !== 'PLAYING') return;

    let faithfulAlive = 0;
    let imposterAlive = 0;

    for (let id in players) {
        if (players[id].isAlive) {
            if (players[id].isImposter) {
                imposterAlive++;
            } else {
                faithfulAlive++;
            }
        }
    }

    if (imposterAlive === 0 || globalTaskProgress >= MAX_TASKS) {
        gameState = 'GAME_OVER';
        io.emit('gameOver', { winner: 'Fieles', reason: imposterAlive === 0 ? 'Judas fue expulsado' : 'Todas las tareas completadas' });
        resetGameToLobby();
    } else if (imposterAlive >= faithfulAlive) {
        gameState = 'GAME_OVER';
        io.emit('gameOver', { winner: 'Judas', reason: 'Judas eliminó a la mayoría' });
        resetGameToLobby();
    }
}

function resetGameToLobby() {
    setTimeout(() => {
        gameState = 'LOBBY';
        deadBodies = [];
        globalTaskProgress = 0;

        // Reset players to lobby state
        for (let id in players) {
            players[id].isAlive = true;
            players[id].isImposter = false;
        }

        io.emit('lobbyUpdate', { players: players, hostId: hostId });
    }, 8000); // Wait 8 seconds before returning to lobby
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
