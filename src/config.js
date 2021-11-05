import {
  importJSONFile,
  writeJSONFile,
  toAbsFilepath,
  folderExists,
  createFolder,
  ensureFolder
} from "./fileutil.js";
import { getFromDB } from "./db.js";
import { readCache } from "./cache.js";
import _ from 'lodash';

export function getConfig({
                            projectId = null,
                            debug = false,
                            fromDB = true,
                            silent = false,
                            all = false,
                            getbuynow = false,
                          }) {
  const baseConfig = importJSONFile(`../config/config.json`);
  baseConfig.args = { projectId, debug, fromDB, silent, all, getbuynow };

  if (!projectId) {
    return baseConfig;
  }

  baseConfig.configFolder = ensureFolder(toAbsFilepath(`../config/`));
  baseConfig.buynowFolder = ensureFolder(toAbsFilepath(`../config/buynow/`));

  const projectConfig = baseConfig.projects[projectId];

  projectConfig.projectId = projectId;

  projectConfig.dataFolder = ensureFolder(toAbsFilepath(`../data/projects/${projectId}/`));
  projectConfig.htmlFolder = ensureFolder(toAbsFilepath(`../data/projects/${projectId}/html/`));

  let dbConfig = fromDB ? getFromDB(projectId) : {};

  const config = { ...dbConfig, ...baseConfig, ...projectConfig };

  // config.debug = debug;

  resetRuntime(config);

  config.freqInfoLog = config.freqInfoLogSecs * 1000 / config.fetchTokensSleepMsec;

  config.data = config.data ?? { collection: {} };
  config.data.collection.tokens = config.data.collection.tokens ?? [];
  config.data.collection.traits = config.data.collection.traits ?? { data: {} };

  config.maxSupply = config.tokenIdRange[1] - config.tokenIdRange[0] + 1;

  const baseCache = { tokens: {}, opensea: {} };
  const fileCache = readCache(config.projectId);
  config.cache = { ...baseCache, ...fileCache };

  return config;
}

export function resetRuntime(config) {
  config.runtime = {};
  config.runtime.stats = {};
  config.runtime.milestones = _.cloneDeep(config.milestones);
  config.runtime.numInfoLog = 0;
}

export function debugToFile(config, filename = 'debug.json') {
  const filepath = toAbsFilepath(config.projectId ? `../data/projects/${config.projectId}/${filename}` : `../data/${filename}`);
  writeJSONFile(filepath, { debug: config });
}

