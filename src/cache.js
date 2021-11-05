import {
  importJSONFile,
  writeJSONFile,
  toAbsFilepath,
  folderExists,
  createFolder,
  ensureFolder, fileExists
} from "./fileutil.js";
import { getFromDB } from "./db.js";
import _ from 'lodash';

import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export function addToCache(cache, key, value, replace = false) {
  try {
    if (get(cache, key) && !replace) {
      return false;
    }
    set(cache, key, value);
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
    return undefined;
  }
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
  return cache[key] ?? null;
}

function set(cache, key, value) {
  return cache[key] = value;
}
