import _ from 'lodash';
import { createRequire } from 'module';

import { addToCache,existsInCache, getFromCache } from "./cache.js";
import { get } from "./fetch.js";
import { log } from "./logUtils.js";
import { delay } from "./miscUtils.js";
import { release,take } from "./semaphore.js";

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
      // console.log('numProcessed, numLeft, numActive, numNew', numToProcess - inputRef.length, inputRef.length, activeRef.length, items.length);
      log.debug(`processed: ${numToProcess - inputRef.length}, left: ${inputRef.length}, active: ${activeRef.length}, new: ${items.length}, ok: ${statsRef['200'] ?? 0}, timeout: ${statsRef.timeout ?? 0}, tooMany: ${statsRef['429'] ?? 0}, `);
      // console.log('stats', statsRef);
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
  // log.debug('stats', statsRef);
  if (result.headers) {
    log.debug('result.headers', result.headers);
  }
  if (!result.headers) {
    log.debug('result.data', result.data);
  }

  if (result.status === '429') {
    // console.log('429 headers:', result.headers);
    const retryAfterSecs = getRetryAfter(result.headers, 2);
    log.debug('retryAfterSecs', retryAfterSecs);
    setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), retryAfterSecs * 1000);
    return;
  } else if (result.status === 'timeout') {
    // console.log('timeout');
    setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), 1000);
    return;
  } else if (result.status === 'connectionRefused') {
    // console.log('connectionRefused');
    setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), 1000);
    return;
  } else if (result.status === 'connectionReset') {
    // console.log('connectionReset');
    setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), 1000);
    return;
  } else if (result.status === 'connectionTimeout') {
    // console.log('connectionReset');
    setTimeout(() => getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt + 1), 1000);
    return;
  } else if (result.status === '404') {
    // do nothing, handle by caller!
  } else if (result.status === '200') {
    addToCache(cacheRef, item.url, result.data);
  } else {
    console.log('Other status: ', JSON.stringify(result));
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
