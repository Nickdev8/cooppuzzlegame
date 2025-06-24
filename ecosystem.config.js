module.exports = {
  apps: [
    {
      name: "escape-room-server",
      script: "index.js",
      cwd: "/home/pi/escape-room/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "escape-room-lobby",
      script: "lobby.js",
      cwd: "/home/pi/escape-room/server",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
