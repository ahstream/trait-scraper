import fetch from 'node-fetch';
import * as miscutil from './miscutil.js';
import { countActiveFetchRequests, countDone, countSkip } from "./count.js";
import { createLogger } from "./lib/loggerlib.js";
import { AbortController } from "node-abort-controller";
import { addTokenTraits } from './rarity.js';
import { addToCache, getFromCache, existsInCache } from './cache.js';
import { convertToBaseTokenURI, createTokenURI, getTokenURI, } from './tokenURI.js';
import _ from 'lodash';
import { ERRORCODES } from "./error.js";

const log = createLogger();

const DEFAULT_FETCH_TIMEOUT = 10000;

// EXPORTED

export async function updateTokens(config, isFinishedCallback) {
  const numTokens = config.data.collection.tokens.length;

  while (true) {
    const nextTokens = getNextTokens(config.data.collection.tokens, config.fetchConcurrentAndSleep[0], config);
    let isInCache = false;
    if (nextTokens.length > 0) {
      log.debug(`(${config.projectId}) Get ${nextTokens.length} tokens`);
      isInCache = existsInCache(config.cache.tokens, nextTokens[0].tokenId);
      nextTokens.forEach(token => {
        updateToken(token, config.data.collection.baseTokenURI, config.data.collection, config);
      });
    }
    if (!isInCache || config.args.forceTokenFetch) {
      // Only pause if tokens have been fetched from source!
      await miscutil.sleep(config.fetchConcurrentAndSleep[1]);
    }

    if (await isFinishedCallback(config)) {
      break;
    }
    const numDone = countDone(config.data.collection.tokens);
    const numSkip = countSkip(config.data.collection.tokens);

    log.info(`(${config.projectId}) ${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens})`);

    /*
    config.runtime.numInfoLog++;
    if (config.runtime.numInfoLog % config.freqInfoLog === 0) {
      log.info(`(${config.projectId}) ${numDone} + ${numSkip} = ${numDone + numSkip} (of ${numTokens})`);
    }
     */
  }
}

async function updateToken(token, baseTokenURI, collection, config) {
  log.debug('updateToken', token.tokenId);
  const tokenData = await getTokenData(token.tokenId, baseTokenURI, config.contractAddress, config.args.forceTokenFetch, config.cache.tokens);

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
  } else if (tokenData.errorCode === 429) {
    if (tokenData.retryAfter) {
      config.runtime.tokenDataRetryAfter = tokenData.retryAfter;
      config.runtime.tokenDataRetryNextTime = miscutil.addSecondsToDate(new Date(), tokenData.retryAfter);
    }
  } else if (tokenData.errorCode === ERRORCODES.connectionRefused) {
    config.runtime.tokenDataRetryAfter = 10;
  }
}

async function getTokenData(tokenId, baseTokenURI, contractAddress, forceTokenFetch, cache = null) {
  if (!forceTokenFetch && cache !== null) {
    const tokenData = getFromCache(cache, tokenId);
    if (!_.isEmpty(tokenData)) {
      log.verbose('Fetched tokenData from cache!');
      return tokenData;
    }
  }

  const tokenURI = createTokenURI(tokenId, baseTokenURI) ?? await getTokenURI(tokenId, contractAddress);

  log.debug('tokenURI:', tokenURI);

  if (!tokenURI) {
    return { error: true, errorCode: ERRORCODES.tokenURI };
  }
  if (tokenURI.error) {
    return { error: true, errorCode: ERRORCODES.tokenURI };
  }

  const result = await fetchTokenData(tokenId, tokenURI);
  if (!result.error && cache !== null) {
    addToCache(cache, tokenId, result);
  }

  return result;
}

export async function fetchTokenById(tokenId, contractAddress) {
  const result = await getTokenURI(tokenId, contractAddress);

  if (result.error) {
    return result;
  }

  return await fetchTokenByURI(tokenId, result.uri);
}

export async function fetchTokenDataById(tokenId, contractAddress) {
  const result = await getTokenURI(tokenId, contractAddress);
  if (result.error) {
    return result;
  }
  return await fetchTokenData(tokenId, result.uri);
}

async function fetchTokenByURI(tokenId, tokenURI) {
  try {
    const tokenData = await fetchTokenData(tokenId, tokenURI);
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

async function fetchTokenData(tokenId, tokenURI, timeout = DEFAULT_FETCH_TIMEOUT) {
  return fetchWithTimeoutWrapper(tokenURI, { timeout });
}

async function fetchWithTimeoutWrapper(uri, options) {
  try {
    // log.debug('fetchWithTimeout:', uri);
    const response = await fetchWithTimeout(uri, options);
    // log.info('fetchWithTimeout:', response.ok, uri);
    if (response.ok) {
      return await response.json();
    }
    return {
      error: true,
      errorCode: response.status,
      errorMessage: response.statusText,
      retryAfter: response.status === 429 ? parseInt(response.headers.get('retry-after')) : null
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      log.debug(`Timeout: ${uri}`);
      return { error: true, errorCode: ERRORCODES.timeout };
    }
    if (error.code === 'ECONNREFUSED') {
      log.debug(`Timeout: ${uri}`);
      return { error: true, errorCode: ERRORCODES.connectionRefused };
    }
    log.debug(`Error, uri: ${uri}, name: ${error.name}, error:`, error);
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

function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

export async function getTokenRevealStatus(token, config) {
  if (!token || _.isEmpty(token) || !token.attributes || token.attributes.length < 1 || _.isEmpty(token.attributes)) {
    return -1;
  }

  if (!isIterable(token.attributes)) {
    return -1;
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

  if (numTraits > 1 && valueMap.size === 1) {
    // All traits have same value => not revealed!
    return -1;
  }

  if (numTraits > 1) {
    return 1;
  }

  if (numTraits === 1) {
    // Might be revealed! Need to check if image property is valid by comparing with other tokens.
    return 0;
  }

  return -1;
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
      // log.debug(`(${config.projectId}) ${thisToken.tokenId}: ${thisToken.status}`);
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
  return !(token.done || token.skip || token.status === 'fetch');
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
