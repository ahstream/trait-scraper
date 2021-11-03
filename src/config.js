import { importJSONFile, writeJSONFile, toAbsFilepath } from "./fileutil.js";
import { getFromDB } from "./db.js";

export function getConfig(projectId, debug = false, fromDB = true) {
  const baseConfig = importJSONFile(`../config/config.json`);

  let projectConfig = {};
  if (projectId) {
    projectConfig = importJSONFile(`../config/projects/${projectId}/config.json`);
  }

  let config;
  if (fromDB) {
    const configFromDB = getFromDB(projectId);
    config = { ...configFromDB, ...baseConfig, ...projectConfig };
  } else {
    config = { ...baseConfig, ...projectConfig };
  }

  config.projectId = projectId;
  config.debug = debug;

  config.data = config.data ?? {};
  config.data.tokenList = config.data.tokenList ?? [];
  config.data.traits = config.data.traits ?? { data: {} };

  return config;
}

export function debugToFile(config, filename = 'debug.json') {
  const filepath = config.projectId ? toAbsFilepath(`../config/projects/${config.projectId}/${filename}`) : `../config/${filename}`;
  writeJSONFile(filepath, { debug: config });
}

