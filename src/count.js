export function countDone(tokenList) {
  let count = 0;
  tokenList.forEach(token => {
    if (token.done) {
      count++;
    }
  });
  return count;
}

export function countSkip(tokenList) {
  let count = 0;
  tokenList.forEach(token => {
    if (token.skip) {
      count++;
    }
  });
  return count;
}

export function countDoneOrSkip(tokenList) {
  let count = 0;
  tokenList.forEach(token => {
    if (token.done || token.skip) {
      count++;
    }
  });
  return count;
}

export function countActiveFetchRequests(tokenList) {
  let count = 0;
  tokenList.forEach(token => {
    if (token.status === 'fetch') {
      count++;
    }
  });
  return count;
}

export function countDoneConfig(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.done) {
      count++;
    }
  }
  return count;
}

export function countSkippedConfig(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.skip) {
      count++;
    }
  }
  return count;
}

export function countFinishedBuynowConfig(config) {
  let count = 0;
  for (var token of config.data.tokenList) {
    if (token.buynow && token.done) {
      count++;
    }
  }
  return count;
}
