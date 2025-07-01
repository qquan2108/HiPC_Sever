const clients = new Set();

function addClient(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  clients.add(res);
  res.write('retry: 10000\n\n');

  res.on('close', () => {
    clients.delete(res);
  });
}

function send(notification) {
  const data = `data: ${JSON.stringify(notification)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

module.exports = { addClient, send };
