const { createWhiteboardServer } = require('./src/server');

if (require.main === module) {
  let backend;
  try {
    backend = createWhiteboardServer();
  } catch (error) {
    console.error('Unable to initialize whiteboard:', error.message);
    process.exitCode = 1;
  }
  if (backend) {
    backend.listen().then((address) => {
      console.log(`Whiteboard listening on port ${address.port}`);
    }).catch(async (error) => {
      console.error('Unable to start whiteboard:', error.message);
      await backend.close();
      process.exitCode = 1;
    });
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      try {
        await backend.close();
      } catch (error) {
        console.error('Shutdown failed:', error.message);
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

module.exports = { createWhiteboardServer };
