module.exports = {
  apps: [
    {
      name: "server",
      script: "dist/src/index.js",
    },
    {
      name: "listener",
      script: "dist/src/listener.js",
    },
    {
      name: "worker",
      script: "dist/src/worker.js",
    },
  ],
};
