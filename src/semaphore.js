const semaphores = {};

export function take(name, logger = null, id = null) {
  if (!semaphores[name]) {
    semaphores[name] = true;
    if (logger) {
      logger(`Semaphore "${name}" is taken by id "${id}"`);
    }
    return true;
  }
  return false;
}

export function release(name, logger = null, id = null) {
  if (logger) {
    logger(`Semaphore "${name}" is released by id "${id}"`);
  }
  semaphores[name] = false;
}
