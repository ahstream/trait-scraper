import {
  fileExists,
  importJSONFile,
  toAbsFilepath,
  writeJSONFile} from "./fileUtils.js";
import { log } from "./logUtils.js";

export function createCache(projectId) {
  const baseCache = {
    tokens: {
      lastUpdate: null,
      lastFullUpdate: null,
      data: {}
    },
    opensea: {
      assets: {
        lastUpdate: null,
        lastFullUpdate: null,
        data: {}
      }
    }
  };
  const fileCache = readCache(projectId);
  return { ...baseCache, ...fileCache };
}

export function addToCache(cache, key, value, replace = true) {
  try {
    if (get(cache, key) && !replace) {
      return false;
    }
    set(cache, key, value);
    cache.lastUpdate = new Date();
    return true;
  } catch (error) {
    log.error('Error:', error);
    return false;
  }
}

export function getFromCache(cache, key) {
  try {
    return get(cache, key);
  } catch (error) {
    log.error('Error:', error);
    return {};
  }
}

export function existsInCache(cache, key) {
  return cache?.data[key] !== undefined;
}

export function readCache(projectId) {
  const filepath = toAbsFilepath(`../data/projects/${projectId}/cache.json`);
  if (fileExists(filepath)) {
    return importJSONFile(filepath).data;
  } else {
    return {};
  }
}

export function writeCache(projectId, cache) {
  const filepath = toAbsFilepath(`../data/projects/${projectId}/cache.json`);
  writeJSONFile(filepath, { data: cache });
}

function get(cache, key) {
  return cache.data[key] ?? null;
}

function set(cache, key, value) {
  return cache.data[key] = value;
}
