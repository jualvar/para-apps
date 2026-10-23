const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

let players = {};
let judasId = null;

const colors = ['#ff9999', '#99ccff', '#99ff99', '#ffff99', '#cc99ff', '#ffcc99'];

io.on('connection', (socket) => {
  console.log('a user connected: ' + socket.id);

  socket.on('joinGame', (username) => {
    players[socket.id] = {
      x: 1000 + Math.random() * 200 - 100, // Center roughly
      y: 1000 + Math.random() * 200 - 100,
      radius: 20,
      color: colors[Object.keys(players).length % colors.length],
      name: username,
      isAlive: true,
      role: 'disciple'
    };

    // Assign roles if enough players, or just make the first one Judas for testing
    if (!judasId || !players[judasId]) {
        judasId = socket.id;
        players[socket.id].role = 'judas';
    }

    socket.emit('init', { id: socket.id, players: players });
    socket.emit('roleAssigned', players[socket.id].role);
    io.emit('updatePlayers', players);
  });

// Server also needs wall data for validation if we wanted it to be authoritative.
// For this simple prototype, we trust the client's optimistic updates slightly,
// but we still apply them here. Ideally, full collision logic goes here too.
const walls = [
    { x: 500, y: 500, w: 200, h: 50 },
    { x: 500, y: 500, w: 50, h: 300 },
    { x: 1200, y: 800, w: 400, h: 400 },
    { x: 800, y: 1500, w: 500, h: 50 },
    { x: 200, y: 200, w: 100, h: 100 },
];

  socket.on('move', (data) => {
    if (players[socket.id] && players[socket.id].isAlive) {
        let p = players[socket.id];
        let newX = p.x + data.dx;
        let newY = p.y + data.dy;
        let canMoveX = true;
        let canMoveY = true;

        for (let wall of walls) {
            if (newX + p.radius > wall.x && newX - p.radius < wall.x + wall.w &&
                p.y + p.radius > wall.y && p.y - p.radius < wall.y + wall.h) {
                canMoveX = false;
            }
            if (p.x + p.radius > wall.x && p.x - p.radius < wall.x + wall.w &&
                newY + p.radius > wall.y && newY - p.radius < wall.y + wall.h) {
                canMoveY = false;
            }
        }

        if (canMoveX) p.x = newX;
        if (canMoveY) p.y = newY;

        // Boundary check
        p.x = Math.max(20, Math.min(1980, p.x));
        p.y = Math.max(20, Math.min(1980, p.y));
    }
  });

  socket.on('kill', (targetId) => {
    if (players[socket.id] && players[socket.id].role === 'judas' && players[socket.id].isAlive) {
        if (players[targetId] && players[targetId].isAlive) {

            // Server-side distance check
            const dist = Math.hypot(
                players[socket.id].x - players[targetId].x,
                players[socket.id].y - players[targetId].y
            );

            if (dist < 150) { // Slightly larger than client to account for lag
                players[targetId].isAlive = false;
                io.emit('playerDied', targetId);
                io.emit('updatePlayers', players);
                console.log(`${players[socket.id].name} killed ${players[targetId].name}`);
            }
        }
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected: ' + socket.id);
    delete players[socket.id];
    if (judasId === socket.id) {
        judasId = null; // Reset Judas if they leave
    }
    io.emit('updatePlayers', players);
  });
});

// Sync loop
setInterval(() => {
    io.emit('updatePlayers', players);
}, 1000 / 60); // 60 FPS update

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});
