import _ from 'lodash';

import { createCache, writeCache } from "./cache.js";
import { createCollection } from "./collection.js";
import {
  ensureFolder,
  importJSONFile,
  toAbsFilepath,
  writeJSONFile} from "./fileUtils.js";
import { log } from "./logUtils.js";
import * as timer from "./timer.js";

// args: command | skipTokenCache | skipOpensea
export function getConfig(projectId, args) {
  const baseConfig = importJSONFile(`../config/config.json`);

  baseConfig.projectId = projectId;
  baseConfig.args = args;

  baseConfig.baseDataFolder = ensureFolder(toAbsFilepath(`../data/`));

  if (!projectId) {
    return baseConfig;
  }

  const projectConfig = baseConfig.projects[projectId];
  if (!projectConfig) {
    log.error(`Project id ${projectId} does not exist! Program will exit!`);
    process.exit(-1);
  }

  projectConfig.projectId = projectId;
  projectConfig.projectFolder = ensureFolder(toAbsFilepath(`../data/projects/${projectId}/`));

  const config = { ...baseConfig, ...projectConfig };

  // config.firstTokenId = config.tokenIdRange[0];
  // config.lastTokenId = config.tokenIdRange[1];
  // config.maxSupply = config.lastTokenId - config.firstTokenId + 1;

  config.freqInfoLog = config.freqInfoLogSecs * 1000 / config.fetchSleepBetween;

  config.collection = createCollection();
  config.collection.projectId = config.projectId;
  config.collection.contractAddress = config.contractAddress;
  config.collection.firstTokenId = config.tokenIdRange[0];
  config.collection.lastTokenId = config.tokenIdRange[1];
  config.collection.maxSupply = config.collection.lastTokenId - config.collection.firstTokenId + 1;

  config.rules.hotTraits = config.rules.hotTraits.map(rule => rule.toLowerCase());

  config.cache = createCache(projectId);
  config.runtime = createRuntime(config);

  return config;
}

export function saveCache(config) {
  const myTimer = timer.create();
  writeCache(config.projectId, config.cache);
  // myTimer.ping(`(${config.projectId}) saveCache duration`);
}

function createRuntime(config) {
  return {
    stats: {},
    newHotTokens: [],
    milestones: _.cloneDeep(config.milestones),
    numInfoLog: 0
  };
}

export function resetRuntime(config) {
  config.runtime = createRuntime(config);
}

export function debugToFile(config, filename = 'debug.json') {
  const filepath = toAbsFilepath(config?.projectId ? `../data/projects/${config.projectId}/${filename}` : `../data/${filename}`);
  writeJSONFile(filepath, { debug: config });
}

