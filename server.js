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
        x: MAP_WIDTH / 2 + (Math.random() * 200 - 100),
        y: MAP_HEIGHT / 2 + (Math.random() * 200 - 100),
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
          mapHeight: MAP_HEIGHT
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
             if (dist < 120) {
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
