import * as fileutil from "./fileutil.js";
import * as jsonutil from "./jsonutil.js";
import * as debugutil from "./debugutil.js";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export function getFromDB(projectId) {
  log.info('getFromDB');
  const path = `../config/projects/${projectId}/db.json`;
  if (fileutil.fileExistsRelPath(path)) {
    const obj = jsonutil.importFile(path);
    if (obj) {
      return obj.data;
    }
  }
  return {};
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
  data.tokenURI = config.data.tokenURI;
  data.tokenIdHistory = config.data.tokenIdHistory;

  fileutil.writeRelativeFile(`../config/projects/${config.projectId}/db.json`, JSON.stringify({ data }, null, 2));

  if (config.debug) {
    debugutil.debugToFile(config);
  }
}
