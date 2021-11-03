import { readFile, writeJSONFile, fileExists, toAbsFilepath } from "./fileutil.js";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export function prepareBuynow(config) {
  config.buynowList = getBuynowList(config);
  config.buynowMap = new Map();
  config.buynowList.forEach((item) => {
    config.buynowMap.set(item.tokenId, item);
  });

  const path = toAbsFilepath(`../config/projects/${config.projectId}/buynow.json`);
  writeJSONFile(path, { data: config.buynowList });
}

function getBuynowList(config) {
  const filepath = toAbsFilepath(`../config/projects/${config.projectId}/buynow.txt`);
  if (!fileExists(filepath)) {
    return [];
  }

  let fakePrice = null;

  const data = readFile(filepath, 'utf8');

  const tokenIdResult = [...data.matchAll(/\\"tokenId\\":\\"([0-9]+)\\"/gim)];
  let priceResult = [...data.matchAll(/\\"quantityInEth\\":\\"([0-9]+)\\"/gim)];

  if (tokenIdResult.length < 1) {
    throw new Error('BuyNow: Empty result!');
  }

  if (tokenIdResult.length !== priceResult.length) {
    // Token ID and Price lists have different length!
    // Use fake price when prices are not known for sure!
    log.info('Error: Token ID and Price lists have different length! Use fake price 0.001.');
    fakePrice = 0.001;
  }

  const tokenList = [];
  const tokenMap = new Map();
  for (let i = 0; i < tokenIdResult.length; i++) {
    const thisId = parseInt(tokenIdResult[i][1]);
    const thisToken = tokenMap.get(thisId);
    if (thisToken) {
      continue;
    }
    const thisPrice = fakePrice ?? parseInt(priceResult[i][1]) / Math.pow(10, 18);
    const thisItem = { tokenId: thisId, price: thisPrice };
    tokenMap.set(thisId, thisItem);
    tokenList.push(thisItem);
  }

  return tokenList;
}
