const WebSocket = require('ws');

// Test WebSocket client
const ws = new WebSocket('ws://localhost:9001');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // Send join message
  const joinMessage = {
    type: 'join',
    playerId: 'test-player-123',
    lobbyCode: 'GLOBAL'
  };
  
  ws.send(JSON.stringify(joinMessage));
  console.log('Sent join message:', joinMessage);
});

ws.on('message', function message(data) {
  console.log('Received:', JSON.parse(data.toString()));
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed');
});

// Close after 5 seconds
setTimeout(() => {
  ws.close();
  process.exit(0);
}, 5000); 