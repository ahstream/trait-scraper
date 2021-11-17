import { sleep } from "./miscutil.js";
import { get } from "./fetch.js";

import _ from 'lodash';

const queue = [];

import { createRequire } from 'module';
import { existsInCache, getFromCache, addToCache } from "./cache.js";

const require = createRequire(import.meta.url);

require('events').EventEmitter.defaultMaxListeners = 125;
require('events').EventEmitter.prototype._maxListeners = 125;

// EXPORTED FUNCTIONS

export async function fetchTokenURIs(projectId, inputArray, outputArray, fetchOptions, cacheRef = null, fetchFromCache = true, statsRef = null) {
  console.log(inputArray[0]);

  queue.push(projectId);
  while (true) {
    if (queue[0] !== projectId) {
      console.log('fetchTokenURIs wait for my turn...');
      await sleep(1000);
    } else {
      break;
    }
  }

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
    console.log('numProcessed, numLeft, numActive, numNew', numToProcess - inputRef.length, inputRef.length, activeRef.length, items.length);
    items.forEach(item => {
      getItem(item, activeRef, outputArray, fetchOptions.timeout, cacheRef, fetchFromCache, statsRef);
    });

    if (!inCache) {
      await sleep(fetchOptions.delay);
    }
  }

  // Remove my projectId from queue to let other projects use this module!
  queue.shift();

  console.log('fetchTokenURIs end!');
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

async function getItem(item, activeRef, outputRef, fetchTimeout, cacheRef, fetchFromCache, statsRef, attempt = 1) {
  if (attempt === 1) {
    activeRef.push(item);
  }

  const itemFromCache = getItemFromCache(item.url, cacheRef, fetchFromCache);
  const result = itemFromCache ?? await get(item.url, { timeout: fetchTimeout });

  addToStats(result.status, statsRef);

  if (result.status === '429') {
    console.log('429 headers:', result.headers);
    const retryAfterSecs = parseInt(result.headers.get('retry-after')) ?? 2;
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
