const express = require('express');
const http = require('http');
const Rx = require('rxjs/Rx');

const PODNAME = process.env.POD_NAME || 'development';

const app = express();
app.set('port', 8080);

const requestSubject = new Rx.Subject();
const rateStream = requestSubject
  .bufferTime(1000)
  .map(buf => buf.length)
  .publishReplay(1)
  .refCount();

app.use((req, res, next) => {
  requestSubject.next(); /* add req to a stream so we can count reqs/sec */
  next()
});

app.get('/', (req, res) => {
  Rx.Observable.of(PODNAME)
    .delay(100)
    .toPromise()
    .then(podName => res.send(PODNAME));
});
app.get('/rate', (req, res) => {
  rateStream
    .take(1)
    .subscribe(reqSec => res.status(200).send(''+reqSec));
});

const server = http
  .createServer(app)
  .listen(app.get('port'), '0.0.0.0', () => console.log(`pod '${PODNAME}' started on port ${app.get('port')}`));

rateStream
  .distinctUntilChanged()
  .subscribe(reqSec => console.log(`Current: ${reqSec} req/sec`));

process.on('SIGTERM', () => { console.log('received SIGTERM, shutting down'); process.exit(); });
process.on('SIGINT', () => { console.log('received SIGINT, shutting down'); process.exit(); });
process.on('SIGHUP', () => { console.log('received SIGHUP, shutting down'); process.exit(); });
