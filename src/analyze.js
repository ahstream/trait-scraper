import * as miscutil from "./miscutil.js";
import * as timer from "./timer.js";
import { getConfig } from "./config.js";
import * as db from "./db.js";
import { addTokenData } from "./fetchTokens.js";
import * as rarity from "./rarity.js";
import * as webPage from "./webPage.js";
import * as debugutil from "./debugutil.js";
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

const log = createLogger();

export async function analyzeCollection({ projectId }) {
  const baseConfig = await fetchCollection({ projectId });
  const numTokens = countDone(baseConfig.data.tokenList);

  const results = [];
  let lastPct = 0;

  for (let pct of baseConfig.analyze) {
    const fromId = Math.round(lastPct * numTokens) + 1;
    const toId = Math.round(pct * numTokens);
    log.info(`Analyze from tokenId ${fromId} to ${toId}`);

    // const baseTokenList = baseConfig.data.tokenList.filter(obj => obj.tokenId >= fromId && obj.tokenId <= toId && obj.done);
    // todo: hämta exakt pct många tokens, inte bara < obj.tokenId!
    const baseTokenList = baseConfig.data.tokenList.filter(obj => obj.tokenId <= toId && obj.done);
    console.log('baseTokenList.length', baseTokenList.length);

    const tokenList = [];
    for (var token of baseTokenList) {
      const newToken = {};
      Object.assign(newToken, token);
      tokenList.push(newToken);
    }
    console.log('tokenList.length', tokenList.length);

    const config = getConfig(projectId, false, false);
    runOneAnalysis(config, tokenList);

    debugutil.debugToFile(config, 'analyzis.json');

    miscutil.sortBy1Key(config.data.tokenList, 'rarityNormalized', false);
    rarity.recalcRank(config.data.tokenList);

    results.push([...config.data.tokenList]);

    for (let i = 0; i < results.length; i++) {
      console.log(i);
      console.log(results.length);
      console.log(results[i].length);
      console.log(`Done: ${countDone(results[i])}`);
      console.log(results[i][0]);
      console.log('----');
    }

    lastPct = pct;
  }

  miscutil.sortBy1Key(baseConfig.data.tokenList, 'rarityNormalized', false);
  rarity.recalcRank(baseConfig.data.tokenList);

  console.log('results.length', results.length);
  for (let i = 0; i < results.length; i++) {
    const pct = baseConfig.analyze[i];
    console.log(countDone(results[i]));
    console.log('pct', pct);
    continue;
    let s = `${pct * 100} %: `;
    for (let j = 0; j < results[i].length; j++) {
      const tokenId = results[i][j].tokenId;
      const rank1 = results[i][j].rank;
      const rank2 = baseConfig.data.tokenList.find(obj => obj.tokenId === tokenId).rank;
      // console.log(results[i][j]);
      s = s + `${rank2} - `;
      if (j >= 2) {
        break;
      }
      if (i >= 2) {
        break;
      }
      console.log(s);
    }
  }

  // createAnalyzeWebPage(results, finalTokenList, baseConfig);

  log.info(results.length);
}

function cloneArray(array) {
  return JSON.parse(JSON.stringify(array));
}

function runOneAnalysis(config, tokenList) {
  log.info('Run one analyzis...');
  prepareTokens(config);
  // todo: ersätt token i config med token från tokenList om token.done!
  tokenList.forEach(token => {
    if (token.source.attributes) {
      const existingToken = config.data.tokenList.find(obj => obj.tokenId === token.tokenId);
      existingToken.attributes = token.source.attributes;
      addTokenData(token.source, token, config.data);
      existingToken.done = true;
    }
  });
  debugutil.debugToFile(config, 'analyzis1.json');
  rarity.calc(config);
  return true;
}
