import _ from 'lodash';
import { createRequire } from 'module';

import { addToCache, existsInCache, getFromCache } from "./cache.js";
import { get } from "./fetch.js";
import { log } from "./logUtils.js";
import { delay } from "./miscUtils.js";

const require = createRequire(import.meta.url);

require('events').EventEmitter.defaultMaxListeners = 125;
require('events').EventEmitter.prototype._maxListeners = 125;

let numUsers = 0;

const DELAY_NORMAL_RETRY = 1000;
const DELAY_REVEALED_RETRY = 5000;

// EXPORTED FUNCTIONS

export async function fetchTokenURIs(projectId, inputArray, outputArray, fetchOptions, lastRetryDate, cacheRef = null, statsRef = null) {
  try {
    numUsers++;

    log.info(`(${projectId}) --------------------------------- Start fetching tokens; numUsers:`, numUsers);

    const inputRef = [...inputArray];
    const activeRef = [];

    let numToProcess = inputRef.length;

    while (true) {
      if (inputRef.length === 0 && activeRef.length === 0) {
        break;
      }

      const numConcurrentNormalized = fetchOptions.concurrent / numUsers;

      const maxNumNew = activeRef.length < numConcurrentNormalized ? numConcurrentNormalized - activeRef.length : 0;
      const items = inputRef.splice(0, maxNumNew);
      const fetchFromCache = items.length ? items[0].fetchFromCache : false;
      const inCache = items.length ? existsInCache(cacheRef, items[0].url) : false;
      log.info(`(${projectId}) processed: ${numToProcess - inputRef.length}, left: ${inputRef.length}, active: ${activeRef.length}, new: ${items.length}, ok: ${statsRef['200'] ?? 0}, timeout: ${statsRef.timeout ?? 0}, tooMany: ${statsRef['429'] ?? 0}, `);
      for (const item of items) {
        item.lastRetryDate = lastRetryDate;
        getItem(item, activeRef, outputArray, fetchOptions.timeout, cacheRef, statsRef, projectId);
      }

      if (!inCache || !fetchFromCache) {
        await delay(fetchOptions.delayBetweenBatches);
      }
    }

    numUsers--;

    log.info(`(${projectId}) End fetching tokens!`);
  } catch (error) {
    log.error('error:', JSON.stringify(error));
    numUsers--;
  }
}

function getItemFromCache(key, cacheRef, fetchFromCache) {
  if (!fetchFromCache) {
    return null;
  }
  const data = getFromCache(cacheRef, key);
  if (!data || data === {}) {
    return null;
  }

  return { status: '200', data };
}

function getRetryAfter(headers, valueIfNotFound) {
  try {
    const result = parseInt(headers.get('retry-after'));
    return result ? result : valueIfNotFound;
  } catch (error) {
    return valueIfNotFound;
  }
}

async function getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt = 1) {
  if (attempt === 1) {
    // Only push to active for first attempt, otherwise it would contain duplicates for retries!
    activeRef.push(item);
  }

  const itemFromCache = getItemFromCache(item.url, cacheRef, item.fetchFromCache);
  const result = itemFromCache ?? await get(item.url, { timeout: fetchTimeout });

  addToStats(result.status, statsRef);

  log.debug(`(${projectId}) result.status`, result.status, item.url);
  if (result.headers) {
    // log.debug(`(${projectId}) result.headers`, result.headers, item.url);
  } else {
    // log.debug(`(${projectId}) result.data`, result.data, item.url);
  }

  const now = new Date();
  if (now > item.lastRetryDate) {
    log.info('Retry deadline, stop revealing tokens!');
    outputRef.push({ ref: item.ref, status: '404' });
    _.remove(activeRef, obj => obj.url === item.url);
    return;
  }

  let finalStatus = result.status;

  switch (result.status) {
    case '429':
      const retryAfterSecs = getRetryAfter(result.headers, 2);
      log.debug('retryAfterSecs', retryAfterSecs);
      setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt + 1), retryAfterSecs * DELAY_NORMAL_RETRY);
      return;
    case 'timeout':
    case 'connectionRefused':
    case 'connectionReset':
    case 'connectionTimeout':
      setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt + 1), DELAY_NORMAL_RETRY);
      return;
    case '500':
    case '503':
    case '504':
      setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt + 1), DELAY_NORMAL_RETRY);
      return;
    case '403':
    case '404':
    case '502': // Bad Gateway
      if (item.hasAsset) {
        // Logic: If token has asset AND collection is revealed, NotFound means that this token metadata is about to be revealed soon!
        setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt + 1), DELAY_REVEALED_RETRY);
        return;
      } else {
        // Do nothing, handle by caller!
      }
      break;
    case '200':
      const realStatus = getStatus200RealStatus(item, result?.data);
      switch (realStatus) {
        case 'ok':
          addToCache(cacheRef, item.url, result.data);
          break;
        case 'retry':
          // log.info('Retry token, no cache');
          item.fetchFromCache = false;
          setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, statsRef, projectId, attempt + 1), DELAY_REVEALED_RETRY);
          await delay(100);
          return;
        default:
          // log.info('Skip invalid token:', item, result);
          finalStatus = '404';
      }
      break;
    default:
      log.info(`(${projectId}) Other status`, JSON.stringify(result));
  }

  outputRef.push({ ref: item.ref, ...result, status: finalStatus });
  _.remove(activeRef, obj => obj.url === item.url);
}

function getStatus200RealStatus(item, resultData) {
  if (!_.isEmpty(resultData?.attributes)) {
    return 'ok';
  }
  if (resultData?.error) {
    // JSON contains error property, token is most likely not valid, treat it as non-existing token!
    return 'skip';
  }
  if (!item.hasAsset) {
    // Token has JSON but no attributes + has no asset => liklely non-existing token!
    return 'skip';
  }
  // Else token is probably valid but has not been revealed yet, we should retry!
  return 'retry';
}

function addToStats(key, stats) {
  if (!stats) {
    return;
  }
  if (!stats[key]) {
    stats[key] = 0;
  }
  stats[key]++;
}
