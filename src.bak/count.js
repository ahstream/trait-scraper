export function countDone(tokens) {
  let count = 0;
  tokens.forEach(token => {
    if (token.done) {
      count++;
    }
  });
  return count;
}

export function countSkip(tokens) {
  let count = 0;
  tokens.forEach(token => {
    if (token.skip) {
      count++;
    }
  });
  return count;
}

export function countDoneOrSkip(tokens) {
  let count = 0;
  tokens.forEach(token => {
    if (token.done || token.skip) {
      count++;
    }
  });
  return count;
}

export function countBuynow(tokens) {
  let count = 0;
  tokens.forEach(token => {
    if (token.isBuynow) {
      count++;
    }
  });
  return count;
}

export function countActiveFetchRequests(tokens) {
  let count = 0;
  tokens.forEach(token => {
    if (token.status === 'fetch') {
      count++;
    }
  });
  return count;
}

export function countDoneConfig(config) {
  let count = 0;
  for (var token of config.data.collection.tokens) {
    if (token.done) {
      count++;
    }
  }
  return count;
}

export function countSkippedConfig(config) {
  let count = 0;
  for (var token of config.data.collection.tokens) {
    if (token.skip) {
      count++;
    }
  }
  return count;
}

export function countFinishedBuynowConfig(config) {
  let count = 0;
  for (var token of config.data.collection.tokens) {
    if (token.buynow && token.done) {
      count++;
    }
  }
  return count;
}
