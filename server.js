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
    { x: 1350, y: 1350, w: 300, h: 300 }
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


// Task System
let globalTaskProgress = 0;
const MAX_TASKS = 50; // Total tasks needed to win
const tasks = [
    { x: 1500, y: 500, name: "Fix the Ark" },
    { x: 500, y: 1500, name: "Part the Red Sea" },
    { x: 2500, y: 1500, name: "Gather Manna" },
    { x: 1500, y: 2500, name: "Find the Lost Sheep" },
    { x: 800, y: 800, name: "Build the Temple" }
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
      // Assign a color
      const assignedColor = colors[colorIndex % colors.length];
      colorIndex++;

      // Assign role (20% chance imposter)
      const isImposter = Math.random() < 0.2;

      // Spawn in center area roughly
      players[socket.id] = {
        id: socket.id,
        name: playerName || `Player${Math.floor(Math.random()*1000)}`,
        x: 600 + (Math.random() * 200 - 100),
        y: 600 + (Math.random() * 200 - 100),
        color: assignedColor,
        isImposter: isImposter,
        isAlive: true,
        facingRight: true
      };

      // Send initial data to the new player
      socket.emit('initGame', {
          players: players,
          deadBodies: deadBodies,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
          tasks: tasks,
          taskProgress: (globalTaskProgress / MAX_TASKS) * 100
      });

      // Broadcast to others
      socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    if (players[socket.id]) {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
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
          startMeeting(socket.id);
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
          if (globalTaskProgress > MAX_TASKS) globalTaskProgress = MAX_TASKS;
          io.emit('updateTaskProgress', (globalTaskProgress / MAX_TASKS) * 100);
      }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
