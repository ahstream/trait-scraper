import fetch from 'node-fetch';
import * as miscutil from './miscutil.js';
import {
  countActiveFetchRequests, countDone, countSkip
} from "./count.js";
import { createLogger } from "./lib/loggerlib.js";
import { AbortController } from "node-abort-controller";
import { addTokenTraits } from './rarity.js';
import { getFromCache, addToCache } from './cache.js';
import {
  convertToBaseTokenURI,
  createTokenURI,
  getTokenURI,
  getTokenURIOrNull
} from './tokenURI.js';
import _ from 'lodash';
import { ERRORCODES } from "./error.js";

const log = createLogger();

const DEFAULT_FETCH_TIMEOUT = 8000;

// EXPORTED

export async function updateTokens(config, isFinishedCallback) {
  const numTokens = config.data.collection.tokens.length;

  while (true) {
    const nextTokens = getNextTokens(config.data.collection.tokens, config.numConcurrent, config);
    if (nextTokens.length > 0) {
      log.debug(`(${config.projectId}) Get ${nextTokens.length} tokens`);
      nextTokens.forEach(token => {
        updateToken(token, config.data.collection.baseTokenURI, config.data.collection, config);
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
      log.info(`(${config.projectId}) ${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens})`);
    }
  }
}

async function updateToken(token, baseTokenURI, collection, config) {
  const tokenData = await getTokenData(token.tokenId, baseTokenURI, config);

  if (tokenData.error) {
    handleTokenDataError(token, tokenData, config);
    return token;
  }

  if (addTokenData(token, tokenData, collection, config)) {
    token.status = 'ok';
    token.done = true;
    addToStats('numOk', config);
  } else {
    token.skip = true;
    addToStats('numNoAttributes', config);
  }

  return token;
}

function handleTokenDataError(token, tokenData, config) {
  token.status = tokenData.errorCode.toString();
  addToStats(`num${tokenData.errorCode}`, config);

  if (tokenData.errorCode === 404
    || tokenData.errorCode === ERRORCODES.nonExistingToken
    || tokenData.errorCode === ERRORCODES.corruptTokenData
    || tokenData.errorCode === ERRORCODES.tokenURI) {
    token.skip = true;
  }
}

async function getTokenData(tokenId, baseTokenURI, config) {
  if (!config.args.forceTokenFetch) {
    const tokenData = getFromCache(config.cache.tokens, tokenId);
    if (!_.isEmpty(tokenData)) {
      return tokenData;
    }
  }

  const tokenURI = createTokenURI(tokenId, baseTokenURI) ?? await getTokenURI(tokenId, config);

  if (!tokenURI) {
    return { error: true, errorCode: ERRORCODES.tokenURI };
  }
  if (tokenURI.error) {
    return { error: true, errorCode: ERRORCODES.tokenURI };
  }

  const result = await fetchTokenData(tokenId, tokenURI, config);
  if (!result.error) {
    addToCache(config.cache.opensea.assets, tokenId, result);
  }

  return result;
}

export async function fetchTokenById(tokenId, config) {
  const result = await getTokenURI(tokenId, config);

  if (result.error) {
    return { error: result.error, errorMessage: result.errorMessage, errorCode: result.errorCode };
  }

  return await fetchTokenByURI(tokenId, result.uri, config);
}

async function fetchTokenByURI(tokenId, tokenURI, config) {
  try {
    const tokenData = await fetchTokenData(tokenId, tokenURI, config);
    if (tokenData.error) {
      return tokenData;
    }
    const token = { ...createToken({}), ...tokenData };
    return processTokenResult(token, tokenId, tokenURI);
  } catch (error) {
    log.error('Error in fetchTokenByURI:', error);
    return { error: true, errorCode: ERRORCODES.unknown, errorMessage: JSON.stringify(error) };
  }
}

async function fetchTokenData(tokenId, tokenURI, config) {
  return fetchWithTimeoutWrapper(tokenURI, { timeout: config.fetchTokenTimeoutMsec ?? DEFAULT_FETCH_TIMEOUT }, config);
}

async function fetchWithTimeoutWrapper(uri, options, config) {
  try {
    const response = await fetchWithTimeout(uri, options);
    if (response.ok) {
      return await response.json();
    }
    return { error: true, errorCode: response.status, errorMessage: response.statusText };
  } catch (error) {
    if (error.name === 'AbortError') {
      log.info(`(${config.projectId}) Timeout: ${uri}`);
      addToStats('numTimeout', config);
      return { error: true, errorCode: ERRORCODES.timeout };
    }
    log.debug(`(${config.projectId}) Error, uri: ${uri}, error: ${error}`);
    addToStats('numUnknownError', config);
    return { error: true, errorCode: ERRORCODES.unknown };
  }
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_FETCH_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

export function addTokenData(token, data, collection, config) {
  if (_.isEmpty(data) || _.isEmpty(data.attributes)) {
    return false;
  }
  token.image = data.image;
  token.source = data;
  addTokenTraits(token, data.attributes, collection, config);
  return true;
}

export async function isTokenRevealed(token, config) {
  if (!token || _.isEmpty(token) || _.isEmpty(token.attributes)) {
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
    // log.info(`Revealed ${config.projectId} token:`, token);
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
      log.debug(`(${config.projectId}) ${thisToken.tokenId}: ${thisToken.status}`);
      numNext--;
    }
  }
  if (nextTokens.length) {
    log.debug(`(${config.projectId}) Return ${nextTokens.length}`);
  }
  log.debug(`(${config.projectId}) Active: ${numActiveRequests} (${numConcurrent}), New: ${nextTokens.length}`);
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

function processTokenResult(token, tokenId, tokenURI) {
  token.ok = true;
  token.tokenId = tokenId.toString();
  token.tokenIdSortKey = Number(tokenId);
  token.tokenURI = tokenURI;
  token.baseTokenURI = convertToBaseTokenURI(tokenId, tokenURI);
  return token;
}

export function createToken(args) {
  return {
    tokenId: args.tokenId ?? null,
    tokenIdSortKey: args.tokenIdSortKey ?? null,
    tokenURI: args.tokenURI ?? null,
    price: args.price ?? null,
    lastPrice: args.lastPrice ?? null,
    lastSaleDate: args.lastSaleDate ?? null,
    isBuynow: args.isBuynow ?? null,
    traits: [],
    traitCount: null,
    freq: null,
    rarity: null,
    rarityNorm: null,
    freqRank: null,
    rarityRank: null,
    rarityNormRank: null,
  };
}

export async function updateTokensBAK(config, isFinishedCallback) {
  const numTokens = config.data.collection.tokens.length;

  while (true) {
    const nextTokens = getNextTokens(config.data.collection.tokens, config.numConcurrent, config);
    if (nextTokens.length > 0) {
      log.debug(`(${config.projectId}) Get ${nextTokens.length} tokens`);
      nextTokens.forEach(token => {
        updateToken(token, config.data.collection.baseTokenURI, config.fetchTokenTimeoutMsec, config.data.collection, config);
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
      log.info(`(${config.projectId}) ${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens})`);
    }
  }
}

async function updateTokenBAK(token, baseTokenURI, timeout, collection, config) {
  let tokenData = {};
  if (!config.args.forceTokenFetch) {
    tokenData = getFromCache(config.cache.tokens, token.tokenId);
  }
  const foundInCache = !_.isEmpty(tokenData);
  if (!foundInCache) {
    token.status = 'fetch';
    const result = await fetchTokenData2(token, baseTokenURI, timeout, collection, config);
    if (result.error) {
      token.status = result.errorCode.toString();
      if (result.errorCode === 404 || result.errorCode === 403) {
        token.skip = true;
      }
      return token;
    }
    tokenData = tokenData.data;
  }

  if (addTokenData(token, tokenData, collection, config)) {
    token.status = 'ok';
    token.done = true;
    addToStats('numOk', config);
    if (!foundInCache) {
      addToCache(config.cache.tokens, token.tokenId, tokenData);
    }
  } else {
    token.skip = true;
    addToStats('numNoAttributes', config);
  }

  return token;
}

async function fetchTokenDataBAK2(token, baseTokenURI, timeout, collection, config) {
  try {
    token.status = 'fetch';
    token.tokenURI = createTokenURI(token.tokenId, baseTokenURI);

    log.debug(`(${config.projectId}) GET ${token.tokenId}: ${token.tokenURI}`);
    const response = await fetchWithTimeout(token.tokenURI, {
      timeout: timeout ?? DEFAULT_FETCH_TIMEOUT
    });

    token.status = response.status;
    token.statusCode = response.status;

    log.debug(`(${config.projectId}) RESULT ${token.tokenId}: ${token.statusCode}`);

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 404 || response.status === 403) {
      token.skip = true;
    }

    addToStats(`num${response.status}`, config);

    return {};
  } catch (error) {
    if (error.name === 'AbortError') {
      token.status = 'timeout';
      log.info(`(${config.projectId}) Timeout tokenId: ${token.tokenId}`);
      // stats.numTimeout++;
      addToStats('numTimeout', config);
    } else {
      token.status = 'error';
      log.debug(`(${config.projectId}) Error tokenId ${token.tokenId}: ${error}`);
      // stats.numUnknownError++;
      addToStats('numUnknownError', config);
    }
    return {};
  }
}
