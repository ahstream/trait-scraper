import * as fileutil from "./fileutil.js";
import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export function prepareBuynow(config) {
  const textFilePath = fileutil.absFilePath(`../config/projects/${config.projectId}/buynow.txt`);
  const buynowList = getBuynowList(textFilePath);

  const jsonFilePath = fileutil.absFilePath(`../config/projects/${config.projectId}/buynow.json`);
  fileutil.writeFile(jsonFilePath, JSON.stringify({ data: buynowList }, null, 2));

  config.buynowList = buynowList;
  config.buynowMap = new Map();
  config.buynowList.forEach((item) => {
    config.buynowMap.set(item.tokenId, item);
  });
}

function getBuynowList(filePath) {
  if (!fileutil.fileExists(filePath)) {
    return [];
  }

  let fakePrice = null;

  const data = fileutil.readFile(filePath, 'utf8');

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
  // return tokenList.sort((a, b) => (a.price > b.price) ? 1 : ((b.price > a.price) ? -1 : 0));
}
