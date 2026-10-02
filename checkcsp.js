const { spawn } = require('child_process');
const http = require('http');

let child = spawn('npx', ['next','start','-p','3000'], {cwd:'C:/Users/mukun/Downloads/raz'});

let started = false, headers = '';
child.stdout.on('data', (d) => {
  process.stdout.write(d);
  if (d.toString().includes('ready') && !started) {
    started = true;
    setTimeout(() => {
      const req = http.get('http://localhost:3000', {headers:{'Connection':'close'}}, (res) => {
        headers = '';
        for (const [k,v] of Object.entries(res.headers)) {
          headers += `${k}: ${v}\n`;
        }
        console.log('\nHEADERS:\n' + headers);
        child.kill('SIGTERM');
        process.exit(0);
      });
      req.on('error', e => console.error(e));
    }, 2000);
  }
});
child.stderr.on('data', d => process.stderr.write(d));
