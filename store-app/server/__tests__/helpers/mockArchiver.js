// Stub for archiver (ESM-only package) in Jest CJS test environment
const { EventEmitter } = require('events');

function archiver() {
  const emitter = new EventEmitter();
  emitter.pipe = jest.fn().mockReturnThis();
  emitter.append = jest.fn().mockReturnThis();
  emitter.directory = jest.fn().mockReturnThis();
  emitter.file = jest.fn().mockReturnThis();
  emitter.finalize = jest.fn().mockResolvedValue(undefined);
  emitter.pointer = jest.fn().mockReturnValue(0);
  return emitter;
}

module.exports = archiver;
module.exports.default = archiver;
