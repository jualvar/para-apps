const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const colors = ['red', 'blue', 'green', 'pink', 'orange', 'yellow', 'black', 'white', 'purple', 'cyan'];

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // Assign a color
  const assignedColor = colors[Object.keys(players).length % colors.length];

  // Assign role
  const isImposter = Math.random() < 0.2; // 20% chance to be imposter

  players[socket.id] = {
    x: 400,
    y: 300,
    color: assignedColor,
    isImposter: isImposter,
    isAlive: true,
    id: socket.id
  };

  // Send current players to the new player
  socket.emit('currentPlayers', players);

  // Broadcast to all other players that a new player joined
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id] && players[socket.id].isAlive) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('kill', (targetId) => {
      if (players[socket.id] && players[socket.id].isImposter && players[socket.id].isAlive) {
          if (players[targetId] && players[targetId].isAlive && !players[targetId].isImposter) {
             // Basic distance check (could be improved)
             const dist = Math.hypot(players[socket.id].x - players[targetId].x, players[socket.id].y - players[targetId].y);
             if (dist < 100) {
                 players[targetId].isAlive = false;
                 io.emit('playerKilled', targetId);
             }
          }
      }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
