/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import * as jsonutil from "./jsonutil.js";
import * as collectionlib from "./collection.js";

const globalConfig = jsonutil.importFile('../config/config.json');

const log = createLogger();

// MAIN FUNCTIONS ----------------------------------------------------------------------------------

export function create(id) {
  const config = jsonutil.importFile(`../config/projects/${id}/config.json`);
  const project = {
    config,
    addCollection: () => addCollection(project),
    crawlCollection: () => crawlCollection(project),
    save: () => save(project),
  };
  project.config.tokenURISignatur = project.config.tokenURISignatur ?? globalConfig.etherscan.tokenURISignatur;
  project.config.etherscanUrl = project.config.etherscanUrl ?? globalConfig.etherscan.url;

  return project;
}

function addCollection(project) {
  project.collection = collectionlib.create(project.config.id, project.config);
}

async function crawlCollection(project) {
  if (!project.collection) {
    project.addCollection();
  }
  await project.collection.crawl(project.config);
}

function save(project) {
  if (project.collection) {
    project.collection.save();
  }
}
