import fetch from 'node-fetch';
import * as miscutil from './miscutil.js';
import {
  countActiveFetchRequests, countDone, countSkip
} from "./count.js";
import { createLogger } from "./lib/loggerlib.js";
import { AbortController } from "node-abort-controller";
import { addTokenTraits } from './rarity.js';
import { addToCache } from './cache.js';
import { createTokenURI } from './tokenURI.js';
import _ from 'lodash';

const log = createLogger();

const DEFAULT_FETCH_TIMEOUT = 6000;

// EXPORTED

export async function fetchTokens(config, isFinishedCallback) {
  const numTokens = config.data.collection.tokens.length;
  while (true) {
    const nextTokens = getNextTokens(config.data.collection.tokens, config.numConcurrent, config);
    if (nextTokens.length > 0) {
      log.debug(`Get ${nextTokens.length} tokens (${config.projectId})`);
      nextTokens.forEach(token => {
        fetchToken(token, config.data.collection.baseTokenURI, config.fetchTokenTimeoutMsec, config.data.collection, config);
      });
    }
    await miscutil.sleep(config.fetchTokensSleepMsec);
    if (isFinishedCallback(config)) {
      break;
    }
    const numDone = countDone(config.data.collection.tokens);
    const numSkip = countSkip(config.data.collection.tokens);

    config.runtime.numInfoLog++;
    if (config.runtime.numInfoLog % config.freqInfoLog === 0) {
      log.info(`${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens}) (${config.projectId})`);
    }
  }
}

export function addTokenData(token, data, collection, config) {
  if (data.attributes) {
    token.image = data.image;
    token.source = data;
    addTokenTraits(token, data.attributes, collection, config);
    return true;
  }
  return false;
}

export async function isTokenRevealed(tokenURI, config) {
  const token = await fetchTokenByURI(tokenURI);

  if (_.isEmpty(token) || _.isEmpty(token.attributes)) {
    return false;
  }

  let numTraits = 0;
  const valueMap = new Map();
  for (let attr of token.attributes) {
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
    log.info(`Revealed ${config.projectId} token:`, token);
    return true;
  }

  return false;
}

// INTERNAL

function getNextTokens(tokens, numConcurrent, config) {
  const nextTokens = [];
  const numActiveRequests = countActiveFetchRequests(tokens);
  let numNext = numConcurrent - numActiveRequests;
  for (let i = 0; i < tokens.length; i++) {
    if (numNext < 1) {
      break;
    }
    const thisToken = tokens[i];
    if (shouldTokenBeFetched(thisToken)) {
      nextTokens.push(thisToken);
      log.debug(`${thisToken.tokenId}: ${thisToken.status} (${config.projectId})`);
      numNext--;
    }
  }
  if (nextTokens.length) {
    log.debug(`Return ${nextTokens.length} (${config.projectId})`);
  }
  log.debug(`Active: ${numActiveRequests} (${numConcurrent}), New: ${nextTokens.length} (${config.projectId})`);
  return nextTokens;
}

function shouldTokenBeFetched(token) {
  const result = !(token.done || token.skip || token.status === 'fetch');
  return result;
}

function addToStats(key, config) {
  if (!config.runtime.stats[key]) {
    config.runtime.stats[key] = 0;
  }
  config.runtime.stats[key]++;
}

async function fetchToken(token, baseTokenURI, timeout, collection, config) {
  try {
    token.status = 'fetch';
    token.uri = createTokenURI(token.tokenId, baseTokenURI);

    log.debug(`GET ${token.tokenId}: ${token.uri} (${config.projectId})`);
    const response = await fetchWithTimeout(token.uri, {
      timeout: timeout ?? DEFAULT_FETCH_TIMEOUT
    });

    token.statusCode = response.status;
    token.status = response.status;

    log.debug(`RESULT ${token.tokenId}: ${token.statusCode} (${config.projectId})`);

    if (response.ok) {
      const data = await response.json();
      if (addTokenData(token, data, collection, config)) {
        token.status = 'ok';
        token.done = true;
        addToStats('numOk', config);
        addToCache(config.cache.tokens, token.tokenId, data);
      } else {
        token.skip = true;
        addToStats('numNoAttributes', config);
      }

      return token;
    }

    if (response.status === 404 || response.status === 403) {
      token.skip = true;
    }

    addToStats(`num${response.status}`, config);

    return {};
  } catch (error) {
    if (error.name === 'AbortError') {
      token.status = 'timeout';
      log.info(`Timeout tokenId ${token.tokenId} (${config.projectId})`);
      // stats.numTimeout++;
      addToStats('numTimeout', config);
    } else {
      token.status = 'error';
      log.debug(`Error tokenId ${token.tokenId}: ${error} (${config.projectId})`);
      // stats.numUnknownError++;
      addToStats('numUnknownError', config);
    }
    return {};
  }
}

async function fetchTokenByURI(tokenURI, timeout) {
  try {
    const token = createToken({ uri: tokenURI });
    const response = await fetchWithTimeout(tokenURI, {
      timeout: timeout ?? DEFAULT_FETCH_TIMEOUT
    });
    if (response.ok) {
      const tokenData = await response.json();
      return { ...token, ...tokenData };
    }
    return {};
  } catch (error) {
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

export function createToken({ tokenId = null, uri = '', price = null, buynow = null }) {
  return {
    tokenId,
    uri,
    price,
    buynow,
    traits: [],
    traitCount: null,
    freq: null,
    freqNorm: null,
    rarity: null,
    rarityNorm: null,
    freqRank: null,
    freqNormRank: null,
    rarityRank: null,
    rarityNormRank: null,
  };
}
