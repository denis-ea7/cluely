const { parentPort } = require('worker_threads');


parentPort.on('message', async (message) => {
  try {
    
    switch (message.type) {
      case 'process':
        
        const result = await processTask(message.data);
        parentPort.postMessage({ type: 'result', data: result });
        break;
      
      default:
        parentPort.postMessage({ 
          type: 'error', 
          error: `Unknown message type: ${message.type}` 
        });
    }
  } catch (error) {
    parentPort.postMessage({ 
      type: 'error', 
      error: error.message 
    });
  }
});

async function processTask(data) {
  
  return {
    status: 'success',
    result: `Processed: ${JSON.stringify(data)}`
  };
}


process.on('uncaughtException', (error) => {
  parentPort.postMessage({ 
    type: 'error', 
    error: `Uncaught Exception: ${error.message}` 
  });
});

process.on('unhandledRejection', (reason) => {
  parentPort.postMessage({ 
    type: 'error', 
    error: `Unhandled Rejection: ${reason}` 
  });
}); 