import fetch from 'node-fetch';
import * as miscutil from './miscutil.js';
import {
  countActiveFetchRequests, countDone, countSkip
} from "./count.js";
import { createLogger } from "./lib/loggerlib.js";
import { AbortController } from "node-abort-controller";
import { addTokenTraits } from './rarity.js';
import { createTokenURI } from './tokenURI.js';

const log = createLogger();

const DEFAULT_FETCH_TIMEOUT = 6000;

const stats = {
  numOk: 0,
  num404: 0,
  num429: 0,
  numTimeout: 0,
  numUnknownError: 0,
};

export async function fetchTokens(config, timeout, isFinishedCallback) {
  const numTokens = config.data.tokenList.length;
  while (true) {
    const nextTokens = getNextTokens(config.data.tokenList, config.numConcurrent);
    if (nextTokens.length > 0) {
      log.debug(`Get ${nextTokens.length} tokens`);
      nextTokens.forEach(token => {
        fetchToken(token, config.data.baseTokenURI, timeout, config.data);
      });
      await miscutil.sleep(10);
    } else {
      await miscutil.sleep(10);
    }
    if (isFinishedCallback(config, stats)) {
      break;
    }
    const numDone = countDone(config.data.tokenList);
    const numSkip = countSkip(config.data.tokenList);
    log.info(`${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens})`);
  }
}

function getNextTokens(tokenList, numConcurrent) {
  const tokens = [];
  const numActiveRequests = countActiveFetchRequests(tokenList);
  let numNext = numConcurrent - numActiveRequests;
  log.debug(`Active: ${numActiveRequests} (${numConcurrent}), New: ${numNext}`);
  for (let i = 0; i < tokenList.length; i++) {
    if (numNext < 1) {
      break;
    }
    const thisToken = tokenList[i];
    if (shouldTokenBeFetched(thisToken)) {
      tokens.push(thisToken);
      numNext--;
    }
  }
  return tokens;
}

function shouldTokenBeFetched(token) {
  if (token.done || token.skip || token.status === 'fetch') {
    return false;
  }
  return true;
}

async function fetchToken(token, baseTokenURI, timeout, collectionData) {
  try {
    token.status = 'fetch';
    token.uri = createTokenURI(token.tokenId, baseTokenURI);
    const response = await fetchWithTimeout(token.uri, {
      timeout: timeout ?? DEFAULT_FETCH_TIMEOUT
    });

    token.statusCode = response.status;

    if (response.ok) {
      const data = await response.json();
      token.status = 'ok';
      token.done = true;
      stats.numOk++;
      addTokenData(token, data, collectionData);
      return token;
    } else if (response.status === 404) {
      log.debug(`404: ${baseTokenURI}, ${token.tokenId}`);
      token.status = '404';
      token.skip = true;
      stats.num404++;
    } else if (response.status === 429) {
      log.debug(`429: ${baseTokenURI}, ${token.tokenId}`);
      token.status = '429';
      stats.num429++;
    }
    return {};
  } catch (error) {
    if (error.name === 'AbortError') {
      token.status = 'timeout';
      log.info(`Timeout`);
      stats.numTimeout++;
    } else {
      token.status = 'error';
      log.error(`Error: ${error}`);
      stats.numUnknownError++;
    }
    return {};
  }
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 8000 } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

export function addTokenData(token, data, collectionData) {
  if (data.attributes) {
    token.image = data.image;
    token.source = data;
    addTokenTraits(token, data.attributes, collectionData);
  }
}

export async function isTokenRevealed(tokenURI, config) {
  const token = await getSimpleToken(tokenURI);

  if (!token?.attributes) {
    return false;
  }

  let numTraits = 0;
  const valueMap = new Map();
  for (let attr of token?.attributes) {
    if (attr.trait_type) {
      if (attr.display_type) {
        // Dont count other types than normal (string) traits!
        continue;
      }
      numTraits++;
      valueMap.set(attr.value, true);
    }
  }
  if (numTraits >= config.minTraitsNeeded && valueMap.size >= config.minDifferentTraitValuesNeeded) {
    log.info('Revealed token:', token);
    return true;
  }

  return false;
}

async function getSimpleToken(tokenURI, timeout) {
  try {
    const response = await fetchWithTimeout(tokenURI, {
      timeout: timeout ?? DEFAULT_FETCH_TIMEOUT
    });
    if (response.ok) {
      return await response.json();
    }
    return {};
  } catch (error) {
    return {};
  }
}
