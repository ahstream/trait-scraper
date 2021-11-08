import {
  importJSONFile,
  writeJSONFile,
  toAbsFilepath,
  ensureFolder
} from "./fileutil.js";
import { createCache, writeCache } from "./cache.js";
import _ from 'lodash';
import { createCollection } from "./collection.js";
import { createLogger } from "./lib/loggerlib.js";
import * as timer from "./timer.js";

const log = createLogger();

// args: command | forceTokenFetch | forceAssetFetch
export function getConfig(projectId, args) {
  const baseConfig = importJSONFile(`../config/config.json`);

  baseConfig.projectId = projectId;
  baseConfig.args = args;

  if (!projectId) {
    return baseConfig;
  }

  const projectConfig = baseConfig.projects[projectId];
  if (!projectConfig) {
    log.error(`Project id ${projectId} does not exist! Program will exit!`);
    process.exit(0);
  }

  projectConfig.projectId = projectId;
  projectConfig.projectFolder = ensureFolder(toAbsFilepath(`../data/projects/${projectId}/`));

  const config = { ...baseConfig, ...projectConfig };

  config.data = { collection: createCollection() };

  config.firstTokenId = config.tokenIdRange[0];
  config.lastTokenId = config.tokenIdRange[1];
  config.maxSupply = config.lastTokenId - config.firstTokenId + 1;

  config.maxSupply = config.tokenIdRange[1] - config.tokenIdRange[0] + 1;
  config.freqInfoLog = config.freqInfoLogSecs * 1000 / config.fetchTokensSleepMsec;

  config.cache = createCache(projectId);
  config.runtime = createRuntime(config);

  return config;
}

export function saveCache(config) {
  const myTimer = timer.create();
  writeCache(config.projectId, config.cache);
  myTimer.ping(`(${config.projectId}) saveCache duration`);
}

function createRuntime(config) {
  return {
    stats: {},
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

