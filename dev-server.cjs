const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.LIFE_OS_SERVE_RELEASE==='1'?path.resolve(process.env.LIFE_OS_RELEASE_DIR || path.join(__dirname,'dist')):__dirname;
const port = Number(process.env.PORT || 5180);
const allowed = new Set(require('./release-files.json'));
if(process.env.LIFE_OS_SERVE_RELEASE==='1')allowed.add('release.json');
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(file)) {res.writeHead(404); res.end('Not found'); return;}
  fs.readFile(path.join(root, file), (error, bytes) => {
    if (error) {res.writeHead(404); res.end('Not found'); return;}
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'});
    res.end(bytes);
  });
}).on('error', error => {
  process.stderr.write(error.code === 'EADDRINUSE'
    ? `Port ${port} is in use. Choose an unused port with PORT=5181 npm start.\n`
    : `Life OS preview could not start: ${error.message}\n`);
  process.exitCode = 1;
}).listen(port, '127.0.0.1', () => process.stdout.write('Life OS preview: http://127.0.0.1:' + port + '/\n'));
