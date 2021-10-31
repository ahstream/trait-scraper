import * as jsonutil from "./jsonutil.js";
import * as db from "./db.js";

export function getConfig(projectId, debug = false, fromDB = true) {
  const baseConfig = jsonutil.importFile(`../config/config.json`);

  let projectConfig = {};
  if (projectId) {
    projectConfig = jsonutil.importFile(`../config/projects/${projectId}/config.json`);
  }

  let config;
  if (fromDB) {
    const dataFromDB = db.getFromDB(projectId);
    const configFromDB = { data: dataFromDB };
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
