import _ from 'lodash';
import { createRequire } from 'module';

import { addToCache, existsInCache, getFromCache } from "./cache.js";
import { get } from "./fetch.js";
import { log } from "./logUtils.js";
import { delay } from "./miscUtils.js";
import { release, take } from "./semaphore.js";

const require = createRequire(import.meta.url);

require('events').EventEmitter.defaultMaxListeners = 125;
require('events').EventEmitter.prototype._maxListeners = 125;

// EXPORTED FUNCTIONS

export async function fetchTokenURIs(projectId, inputArray, outputArray, fetchOptions, cacheRef = null, fetchFromCache = true, statsRef = null) {
  try {
    if (!take('fetchTokenURIs', log.info, projectId)) {
      log.info(`(${projectId}) Token fetcher is busy, wait for my turn to fetch tokens...`);
      while (!take('fetchTokenURIs', log.info, projectId)) {
        await delay(250);
      }
    }

    log.info(`(${projectId}) Start fetching tokens...`);

    const inputRef = [...inputArray];
    const activeRef = [];

    let numToProcess = inputRef.length;

    while (true) {
      if (inputRef.length === 0 && activeRef.length === 0) {
        break;
      }

      const maxNumNew = activeRef.length < fetchOptions.concurrent ? fetchOptions.concurrent - activeRef.length : 0;
      const items = inputRef.splice(0, maxNumNew);
      const inCache = items.length ? existsInCache(cacheRef, items[0].url) : false;
      log.debug(`processed: ${numToProcess - inputRef.length}, left: ${inputRef.length}, active: ${activeRef.length}, new: ${items.length}, ok: ${statsRef['200'] ?? 0}, timeout: ${statsRef.timeout ?? 0}, tooMany: ${statsRef['429'] ?? 0}, `);
      items.forEach(item => {
        getItem(item, activeRef, outputArray, fetchOptions.timeout, cacheRef, fetchFromCache, statsRef);
      });

      if (!inCache) {
        await delay(fetchOptions.delayBetweenBatches);
      }
    }

    release('fetchTokenURIs');

    log.info(`(${projectId}) End fetching tokens!`);
  } catch (error) {
    log.error(error);
    release('fetchTokenURIs');
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

async function getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt = 1) {
  if (attempt === 1) {
    activeRef.push(item);
  }

  const itemFromCache = getItemFromCache(item.url, cacheRef, fetchFromCache);
  const result = itemFromCache ?? await get(item.url, { timeout: fetchTimeout });

  addToStats(result.status, statsRef);
  if (result.headers) {
    log.debug('result.headers', result.headers);
  } else {
    log.debug('result.data', result.data);
  }

  switch (result.status) {
    case '429':
      const retryAfterSecs = getRetryAfter(result.headers, 2);
      log.debug('retryAfterSecs', retryAfterSecs);
      setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), retryAfterSecs * 1000);
      return;
    case 'timeout':
    case 'connectionRefused':
    case 'connectionReset':
    case 'connectionTimeout':
      setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), 1000);
      return;
    case '403':
    case '404':
      // do nothing, handle by caller!
      break;
    case '200':
      addToCache(cacheRef, item.url, result.data);
      break;
    default:
      log.info('Other status: ', JSON.stringify(result));
  }

  outputRef.push({ ref: item.ref, ...result });
  _.remove(activeRef, obj => obj.url === item.url);
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
