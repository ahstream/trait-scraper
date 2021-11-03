import { createLogger } from "./lib/loggerlib.js";
import { fileExists, toAbsFilepath, importJSONFile, writeJSONFile } from "./fileutil.js";
import { debugToFile } from "./config.js";

const log = createLogger();

export function getFromDB(projectId) {
  const path = toAbsFilepath(`../config/projects/${projectId}/db.json`);
  if (fileExists(path)) {
    return importJSONFile(path);
    // return readJSONFile(path).data;
  } else {
    return {};
  }
}

export function saveToDB(config) {
  const data = {};
  const tokenList = [];
  for (let i = 0; i < config.data.tokenList.length; i++) {
    if (config.data.tokenList[i].done) {
      tokenList.push(config.data.tokenList[i]);
    }
  }
  data.tokenList = tokenList;
  data.traits = config.data.traits;
  data.isRevealed = config.data.isRevealed;
  data.revealTime = config.data.revealTime;
  data.fetchedTime = config.data.fetchedTime;
  data.fetchDuration = config.data.fetchDuration;
  data.baseTokenURI = config.data.baseTokenURI;
  data.tokenIdHistory = config.data.tokenIdHistory;

  const filepath = toAbsFilepath(`../config/projects/${config.projectId}/db.json`);
  writeJSONFile(filepath, { data });

  if (config.debug) {
    debugToFile(config);
  }
}
