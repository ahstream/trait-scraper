/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';

const log = createLogger();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

/*

function getPrefs(name) {
  let prefs;
  const prefsFilePath = `../config/projects/${name}/prefs.json`;
  if (fs.existsSync(prefsFilePath)) {
    prefs = jsonutil.importFile(filePath);
  } else {
    prefs = {};
  }

  fs.writeFileSync(filePath, JSON.stringify(dbData, null, 2));

  const project = { ...config };
  project.tokenURISignatur = project.tokenURISignatur ?? globalConfig.etherscan.tokenURISignatur;

  const db = dblib.createDb(name, project);
  project.db = db;

  project.nextId = db.data.nextId ?? 1;
  project.tokenURITemplate = db.data.tokenURITemplate ?? project.tokenURITemplate;

  project.getNextAsset = (fromId = 1) => {
    let id = fromId;
    while (id <= db.data.supply && db.data.assets[id - 1].token) {
      id++;
    }
    return id > db.data.supply ? null : db.data.assets[id - 1];
  };

  project.save = () => {
    db.data.name = config.name;
    db.data.collectionUrl = config.collectionUrl;
    db.data.assetUrlTemplate = config.assetUrlTemplate;
    db.data.tokenURITemplate = config.tokenURITemplate;
    db.data.contractAddress = config.contractAddress;
    db.data.supply = config.supply;
    db.data.mintCost = config.mintCost;
    db.data.nextId = project.nextId;
    db.save();
  };

  return project;
}


 */
