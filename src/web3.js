/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createLogger } from './lib/loggerlib.js';
import { curly } from "node-libcurl";
import { isValidTokenURI } from "./tokenURI.js";
import { ERRORCODES } from "./error.js";

const log = createLogger();

const IPFS_URL = 'ipfs://';

const GET_TOKEN_URI_HEADERS = [
  'authority: node1.web3api.com',
  'pragma: no-cache',
  'cache-control: no-cache',
  'sec-ch-ua: "Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
  'sec-ch-ua-mobile: ?0',
  'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
  'sec-ch-ua-platform: "Windows"',
  'content-type: application/json',
  'accept: */*',
  'origin: https://etherscan.io',
  'sec-fetch-site: cross-site',
  'sec-fetch-mode: cors',
  'sec-fetch-dest: empty',
  'referer: https://etherscan.io/',
  'accept-language: sv,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,la;q=0.6,da;q=0.5,de;q=0.4',
];

const ETHERSCAN_API_URL = 'http://node1.web3api.com/';
const TOKENURI_METHOD_SIGNATUR = '0xc87b56dd';

export async function getTokenURIFromContract(id, contractAddress) {
  try {
    return await getTokenURIFromEtherscan(id, contractAddress, ETHERSCAN_API_URL, TOKENURI_METHOD_SIGNATUR);
  } catch (error) {
    return { error: true, errorCode: ERRORCODES.unknown, errorMessage: JSON.stringify(error) };
  }
}

async function getTokenURIFromEtherscan(id, contractAddress, url, signatur) {
  const tokenIdData = createTokenIdData(id, signatur);
  const postFields = `{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"0x0000000000000000000000000000000000000000","data":"${tokenIdData}","to":"${contractAddress}"},"latest"]}`;

  const response = await curly.post(url, { postFields, httpHeader: GET_TOKEN_URI_HEADERS });

  if (response.statusCode !== 200) {
    return {
      error: true,
      errorCode: response.statusCode,
      errorMessage: response.status,
      retryAfter: response.statusCode === 429 && response.headers[0] ? parseInt(response.headers[0]['retry-after']) : null
    };
  }

  let data;
  try {
    data = JSON.parse(response.data);
  } catch (error) {
    return {
      error: true,
      errorCode: ERRORCODES.corruptTokenData,
      errorData: response.data,
      errorMessage: JSON.stringify(error)
    };
  }

  if (data.error) {
    return {
      error: true,
      errorCode: ERRORCODES.nonExistingToken,
      errorCode2: data.error?.code,
      errorMessage: data.error?.message
    };
  }

  const { result } = data;
  if (!result || result.length < 130) {
    return {
      error: true,
      errorCode: ERRORCODES.corruptTokenData,
      errorData: data,
      errorMessage: 'result.length < 130'
    };
  }

  const uri = hex2a(data.result.substring(130)).replace(/\0/g, '').trim();
  if (!isValidTokenURI(uri)) {
    return {
      error: true,
      errorCode: ERRORCODES.corruptTokenData,
      errorData: data,
      errorMessage: 'invalidTokenURI'
    };
  }

  return { uri };
}

function createTokenIdData(id, signatur) {
  const hexId = typeof (id) === 'string' ? parseInt(id, 10).toString(16) : id.toString(16);
  const suffix = hexId.padStart(64, '0');
  return `${signatur}${suffix}`;
}

function hex2a(hexValue) {
  const hexStr = hexValue.toString(); // force conversion
  let str = '';
  for (let i = 0; i < hexStr.length; i += 2)
    str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
  return str;
}
