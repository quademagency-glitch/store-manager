// Stub for archiver (ESM-only package) in Jest CJS test environment.
//
// pipe() previously returned `this` and finalize() resolved without touching
// the destination, so any supertest request against a route that streams a ZIP
// hung until the suite timed out, with no useful message. ledger.js's ZIP
// route was never tested, so the trap sat unsprung until the business export
// needed it. The stub now behaves enough like the real thing for a route test
// to complete: it retains the destination and ends it on finalize.
const { EventEmitter } = require('events');

function archiver() {
  const emitter = new EventEmitter();
  emitter._dest = null;
  emitter.pipe = jest.fn(function pipe(dest) {
    emitter._dest = dest;
    return dest;
  });
  emitter.append = jest.fn().mockReturnThis();
  emitter.directory = jest.fn().mockReturnThis();
  emitter.file = jest.fn().mockReturnThis();
  emitter.abort = jest.fn().mockReturnThis();
  emitter.finalize = jest.fn(async function finalize() {
    if (emitter._dest && typeof emitter._dest.end === 'function') emitter._dest.end();
  });
  emitter.pointer = jest.fn().mockReturnValue(0);
  return emitter;
}

module.exports = archiver;
module.exports.default = archiver;
