/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import * as fileutil from "./fileutil.js";
import fs from "fs";
import * as jsonutil from "./jsonutil.js";
import * as assetlib from "./asset.js";
import * as miscutil from "./miscutil.js";

const globalConfig = jsonutil.importFile('../config/config.json');

const log = createLogger();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

export function create(id, config) {
  const filePath = fileutil.toAbsoluteFilePath(`../config/projects/${id}/collection.json`);

  let data;
  if (fs.existsSync(filePath)) {
    data = jsonutil.importFile(filePath);
  } else {
    data = {};
    data.assets = [];
    data.traits = {};
  }
  data.config = config;

  const collectionConfig = { ...config };
  collectionConfig.assetsBatchSize = collectionConfig.assetsBatchSize ?? globalConfig.assetsBatchSize;
  collectionConfig.sleepBetweenEachAsset = collectionConfig.sleepBetweenEachAsset ?? globalConfig.sleepBetweenEachAsset;
  collectionConfig.sleepBetweenEachAssetBatch = collectionConfig.sleepBetweenEachAssetBatch ?? globalConfig.sleepBetweenEachAssetBatch;

  if (data.assets.length !== collectionConfig.supply) {
    for (let i = 0; i < collectionConfig.supply; i++) {
      data.assets.push(assetlib.create(i + 1));
    }
  }

  const collection = {
    config: collectionConfig,
    data,
    filePath,
    save: () => save(collection),
    crawl: async () => crawl(collection),
    getAsset: (id) => getAsset(id, collection),
  };

  return collection;
}

function save(collection) {
  fs.writeFileSync(collection.filePath, JSON.stringify(collection.data, null, 2));
}

async function crawl(collection) {
  try {
    log.info(`Crawl collection: ${collection.config.id}`);
    while (true) {
      await processAssets(collection, getNextAssetIds(collection));
      collection.save();
      await miscutil.sleep(collection.config.sleepBetweenEachAssetBatch * 1000);
    }
  } catch (e) {
    log.error('Error at collection.crawl:', e.message, e);
  }
}

// Sequence generator function (commonly referred to as "range", e.g. Clojure, PHP etc)
const range = (start, stop, step) => Array.from({ length: (stop - start) / step + 1 }, (_, i) => start + (i * step));

function getNextAssetIds(collection) {
  const nextId = getNextAssetId(collection);
  if (nextId < 1) {
    return [];
  }
  return range(nextId, collection.config.supply, 1);
}

async function processAssets(collection, assetIds) {
  while (true) {
    const nextIds = assetIds.splice(0, collection.config.assetsBatchSize);
    if (nextIds.length < 1) {
      return;
    }
    log.info('Process assets ids:', nextIds);
    const requests = [];
    for (const id of nextIds) {
      requests.push(assetlib.processAsset(getAsset(id, collection), collection.config));
      await miscutil.sleep(collection.config.sleepBetweenEachAsset);
    }

    const result = await Promise.all(requests);
    // todo: process result!
    collection.save();
    await miscutil.sleep(collection.config.sleepBetweenEachAssetBatch);
    // log.info(result);
  }
}

function getAsset(id, collection) {
  if (collection.data.assets[id - 1]) {
    return collection.data.assets[id - 1];
  }
  return null;
}

function getNextAssetId(collection) {
  let id = 1;
  while (id <= collection.config.supply && collection.data.assets[id - 1].done) {
    id++;
  }
  return id > collection.config.supply ? 0 : id;
}

function getNextAsset(fromId = 1, collection) {
  let id = fromId;
  while (id <= collection.config.supply && collection.data.assets[id - 1].done) {
    id++;
  }
  return id > collection.config.supply ? null : collection.data.assets[id - 1];
}

