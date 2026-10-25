const http = require('node:http');
const path = require('node:path');
const {createHash} = require('node:crypto');

function identity(root) {
  return {app: 'make-it-home', startupProtocol: 1,
    installation: createHash('sha256').update(path.resolve(root)).digest('hex')};
}

function probe(port, expected) {
  return new Promise(resolve => {
    const req = http.get({host: '127.0.0.1', port, path: '/api/app-instance', timeout: 1200}, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; if (data.length > 4096) req.destroy(); });
      res.on('end', () => {
        try { const value = JSON.parse(data); resolve(res.statusCode === 200 &&
          Object.keys(expected).every(key => value[key] === expected[key])); }
        catch { resolve(false); }
      });
      res.on('error', () => resolve(false));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const failed = error => { server.removeListener('listening', ready); reject(error); };
    const ready = () => { server.removeListener('error', failed); resolve(server.address().port); };
    server.once('error', failed);
    server.once('listening', ready);
    server.listen(port, '127.0.0.1');
  });
}

async function listenOrReuse(server, {root, port = 8787, attempts = 20, onBusy = () => {}}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be an integer from 0 to 65535.');
  const expected = identity(root);
  for (let offset = 0; offset < attempts && port + offset <= 65535; offset++) {
    const candidate = port + offset;
    try { return {port: await listen(server, candidate), reused: false}; }
    catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate === 0) throw error;
      if (await probe(candidate, expected)) return {port: candidate, reused: true};
      onBusy(candidate);
    }
  }
  throw Error('No available local port. Set PORT to another port and start again.');
}

module.exports = {identity, listenOrReuse};
