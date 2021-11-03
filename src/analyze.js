import * as miscutil from "./miscutil.js";
import * as timer from "./timer.js";
import { getConfig, debugToFile } from "./config.js";
import * as db from "./db.js";
import { addTokenData } from "./token.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import {
  countDone,
  countDoneConfig,
  countSkippedConfig,
  countDoneOrSkip,
  countSkip
} from "./count.js";

import { fetchCollection, prepareTokens } from './collection.js';

import opn from "opn";
import { createLogger } from "./lib/loggerlib.js";
import { createAnalyzeWebPage } from "./webPage.js";

const log = createLogger();

export async function analyzeCollection({ projectId }) {
  const baseConfig = await fetchCollection({ projectId });
  const numTokens = countDone(baseConfig.data.tokenList);
  const baseTokenList = baseConfig.data.tokenList.filter(obj => obj.done);

  let lastPct = 0;
  const results = [];

  for (let pct of baseConfig.analyze) {
    const fromId = Math.round(lastPct * numTokens) + 1;
    const toId = Math.round(pct * numTokens);
    log.info(`Analyze from tokenId ${fromId} to ${toId}`);

    const config = getConfig(projectId, false, false);
    prepareTokens(config);

    miscutil.shuffle(baseTokenList);
    for (let i = 0; i < toId; i++) {
      const id = i + 1;
      const oldItem = config.data.tokenList[i];
      Object.assign(oldItem, baseTokenList[i]);
    }
    runOneAnalysis(config);
    rarity.calcRank(config.data.tokenList, 'rarityNormalized', false);

    results.push([...config.data.tokenList]);
    lastPct = pct;
  }

  rarity.calcRank(baseConfig.data.tokenList, 'rarityNormalized', false);
  printResults(results, baseConfig);

  webPage.createAnalyzeWebPage(baseConfig, results, true);
}

function printResults(results, baseConfig) {
  console.log('results.length', results.length);
  for (let i = 0; i < results.length; i++) {
    const pct = baseConfig.analyze[i];
    const done = countDone(results[i]);
    const stopIdx = Math.round(done * 0.005) - 1;
    console.log(done);
    console.log('pct', pct);
    let s = `${Math.round(pct * 100)}%: `;
    for (let j = 0; j < results[i].length; j++) {
      const tokenId = results[i][j].tokenId;
      const rank1 = results[i][j].rank;
      const rank2 = baseConfig.data.tokenList.find(obj => obj.tokenId === tokenId).rank;
      // console.log(results[i][j]);
      s = s + `${rank1}/${rank2}/${tokenId} - `;
      if (j > stopIdx) {
        break;
      }
    }
    console.log(s);
  }
}

function runOneAnalysis(config) {
  debugToFile(config, 'analyzis12.json');
  log.info('Run one analyzis...');
  // todo: ersätt token i config med token från tokenList om token.done!
  config.data.tokenList.forEach(token => {
    if (token.source?.attributes) {
      addTokenData(token, token.source, config.data);
      token.done = true;
    }
  });
  debugToFile(config.data.traits, 'analyzis123.json');
  rarity.calc(config);
  return true;
}
