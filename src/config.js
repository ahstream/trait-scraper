import _ from 'lodash';

import { createCache, writeCache } from "./cache.js";
import { createCollection } from "./collection.js";
import {
  ensureFolder,
  importJSONFile,
  toAbsFilepath,
  writeJSONFile
} from "./fileUtils.js";
import { log } from "./logUtils.js";
import * as timer from "./timer.js";
import { normalizeTrait } from "./token.js";

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

  const maxSupply = config.supply[0];

  config.collection = createCollection();
  config.collection.runtime = createRuntime(config);
  config.collection.projectId = config.projectId;
  config.collection.contractAddress = config.contractAddress;
  config.collection.maxSupply = maxSupply;
  config.collection.firstTokenId = config.supply[1] ?? 0;
  config.collection.lastTokenId = config.supply[2] ?? maxSupply;
  config.collection.rules = normalizeRules(config.rules);

  config.cache = createCache(projectId);

  return config;
}

function normalizeRules(rules) {
  const newRules = { ...rules };
  newRules.hotTraits = newRules.hotTraits.map(rule => normalizeTrait(rule)).filter(obj => obj !== '');
  return newRules;
}

export function saveCache(config) {
  const myTimer = timer.create();
  writeCache(config.projectId, config.cache);
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
  config.collection.runtime = createRuntime(config);
}

export function debugToFile(config, filename = 'debug.json') {
  const filepath = toAbsFilepath(config?.projectId ? `../data/projects/${config.projectId}/${filename}` : `../data/${filename}`);
  writeJSONFile(filepath, { debug: config });
}

