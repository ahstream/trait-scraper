import { getConfig } from "./config.js";
import * as timer from "./timer.js";
import {
  countDoneConfig,
  countSkippedConfig,
} from "./count.js";

import { createLogger } from "./lib/loggerlib.js";
import * as poll from "./poll.js";
import * as collection from "./collection.js";

const log = createLogger();

export async function testCollection({ projectId, doSample = false, debug = false }) {
  const config = getConfig(projectId, debug);

  const numConcurrentList = doSample ? config.testSamples.numConcurrent : [config.numConcurrent];

  const results = [];
  for (const numConcurrent of numConcurrentList) {
    const numConcurrentKey = numConcurrent.toString();
    const subConfig = getConfig(projectId, debug, false);
    subConfig.numConcurrent = numConcurrent;
    subConfig.isTest = true;
    subConfig.threshold.buynow = true;

    const myTimer = timer.createTimer();
    await testFetchCollection(projectId, subConfig);
    results.push([numConcurrentKey, myTimer.getSeconds()]);
  }

  log.info('Results:', results);
}

async function testFetchCollection(projectId, config) {
  log.info(`Start testing collection ${projectId}`);

  collection.prepareTokens(config);

  await poll.pollForReveal(config);
  await collection.fetchCollectionTokens(config);

  log.info(`Finished testing collection "${projectId}", ${countDoneConfig(config)} ok, ${countSkippedConfig(config)} skipped!`);
}