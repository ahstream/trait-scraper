import { createLogger } from "./lib/loggerlib.js";
import { fileExists, toAbsFilepath, importJSONFile, writeJSONFile } from "./fileutil.js";
import { debugToFile } from "./config.js";
import { writeCache } from "./cache.js";

const log = createLogger();

export function getFromDB(projectId) {
  const path = toAbsFilepath(`../data/projects/${projectId}/db.json`);
  if (fileExists(path)) {
    return importJSONFile(path);
  } else {
    return {};
  }
}

export function saveToDB(config) {
  const data = {};
  data.collection = config.data.collection;

  const filepath = `${config.dataFolder}db.json`;

  writeJSONFile(filepath, { data });

  writeCache(config.projectId, config.cache);
}
