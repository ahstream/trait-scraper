async function testCollection({ projectId, doSample = false, debug = false }) {
  const config = getConfig(projectId, debug);

  const nextTokensBatchSize = doSample ? config.testSamples.nextTokensBatchSize : [config.nextTokensBatchSize];
  const nextTokensFetchNewWhenFinishedPct = doSample ? config.testSamples.nextTokensFetchNewWhenFinishedPct : [config.nextTokensFetchNewWhenFinishedPct];

  const results = {};
  for (const batchSize of nextTokensBatchSize) {
    const batchKey = batchSize.toString();
    if (!results[batchKey]) {
      results[batchKey] = [];
    }
    for (const finishedPct of nextTokensFetchNewWhenFinishedPct) {
      const newConfig = getConfig(projectId, debug);
      newConfig.nextTokensBatchSize = batchSize;
      newConfig.nextTokensFetchNewWhenFinishedPct = finishedPct;
      newConfig.isTest = true;
      newConfig.threshold.buynow = true;
      const timer = createTimer();
      await testFetchCollection(projectId, newConfig);
      results[batchKey].push([finishedPct, timer.getSeconds()]);
      log.info('timer:', timer.getSeconds());
    }
  }
  log.info('Results:', results);
}

async function testFetchCollection(projectId, config) {
  log.info('Start testing collection');
  const startDate = new Date();

  prepareTokens(config);

  await pollForReveal(config, true);
  await fetchCollectionMilestones(config.fetchMilestones, config);

  log.info(`Finished pre-fetching collection: ${countDoneConfig(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);

  createResults(config);

  if (config.debug) {
    debugToFile(config);
  }

  log.info(`Finished testing collection: ${countDoneConfig(config)} tokens`);
  log.info('Duration (sec):', ((new Date()).getTime() - startDate.getTime()) / 1000);
}
