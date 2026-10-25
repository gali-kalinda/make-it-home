const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {identity, listenOrReuse} = require('../startup-runtime.cjs');
const root = path.resolve(__dirname, '..');
const servers = [], children = [];
function create(handler) { const server = http.createServer(handler); servers.push(server); return server; }
function start(file, port) {
  const child = spawn(process.execPath, [file], {cwd: root, env: {...process.env, PORT: String(port), NO_OPEN: '1'}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  children.push(child);
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  return {child, output: () => output};
}
function ready(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Startup timed out')), 15000);
    child.once('message', value => { clearTimeout(timer); resolve(value); });
    child.once('exit', code => { clearTimeout(timer); reject(Error('Server exited before ready: ' + code)); });
  });
}
async function run() {
  const foreign = create((req, res) => res.end('another application'));
  await listenOrReuse(foreign, {root: 'foreign', port: 0});
  const occupied = foreign.address().port;
  const app = create((req, res) => res.end(JSON.stringify(identity(root))));
  const first = await listenOrReuse(app, {root, port: occupied});
  assert(first.port !== occupied && !first.reused, 'Must skip foreign port without stopping its owner');
  assert.equal(await (await fetch('http://127.0.0.1:' + occupied)).text(), 'another application');
  const second = await listenOrReuse(create(), {root, port: occupied});
  assert.deepEqual(second, {...first, reused: true}, 'Double launch must reuse the same installation');
  const other = await listenOrReuse(create(), {root: root + '-different-installation', port: first.port});
  assert(!other.reused && other.port !== first.port, 'Do not reuse another installed copy');
  await assert.rejects(listenOrReuse(create(), {root, port: occupied, attempts: 1}), /No available/);
  for (const port of [-1, 65536, NaN, 1.2]) await assert.rejects(listenOrReuse(create(), {root, port}), /PORT/);
  const simultaneous = await Promise.all([create(), create()].map(server => listenOrReuse(server, {root, port: occupied > 65000 ? 25000 : occupied + 20})));
  // These synthetic servers have no identity route, so neither may claim to reuse the other.
  assert.notEqual(simultaneous[0].port, simultaneous[1].port);

  await Promise.all(servers.filter(server => server !== foreign && server.listening).map(server => new Promise(resolve => server.close(resolve))));
  const live = start('server.cjs', occupied);
  const message = await ready(live.child);
  assert.equal(message.type, 'ready');
  assert.equal(message.reused, false);
  assert.notEqual(new URL(message.url).port, String(occupied));
  const origin = message.url;
  const settings = await fetch(origin + '/api/settings/vision', {headers: {Origin: origin}});
  assert.equal(settings.status, 200, 'Same-origin settings must work on the selected fallback port');
  assert.equal((await fetch(origin + '/api/settings/vision', {headers: {Origin: 'https://unrelated.example'}})).status, 403);
  assert.match(await (await fetch(origin)).text(), /Make It Home|MAKE IT|make-it-home/i);
  const repeated = start('scripts/start.cjs', occupied);
  const [code] = await once(repeated.child, 'exit');
  assert.equal(code, 0, repeated.output());
  assert(repeated.output().includes('already running: ' + origin), repeated.output());
  assert(repeated.output().includes('Open in your browser: ' + origin), 'Browser must receive actual port, not the occupied configured port');
  assert.equal((await fetch(origin + '/api/app-instance')).status, 200, 'Original service must remain alive');
  const invalid = start('server.cjs', 'invalid');
  const [invalidCode] = await once(invalid.child, 'exit');
  assert.equal(invalidCode, 1);
  assert.match(invalid.output(), /PORT must be/);
  console.log('Startup: occupied port, repeat launch, separate installation, race, same-origin settings and invalid PORT passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.all(servers.filter(server => server.listening).map(server => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);})));
});
