import http from 'http';
import https from 'https';
import { AbortController } from "node-abort-controller";
import nodeFetch from 'node-fetch';

import { log } from "./logUtils.js";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const agent = (_parsedURL) => _parsedURL.protocol === 'http:' ? httpAgent : httpsAgent;

const DEFAULT_FETCH_TIMEOUT = 3000;

// EXPORTED FUNCTIONS

export async function get(uri, options = {}, responseFormat = 'json') {
  return fetch(uri, 'GET', options, responseFormat);
}

async function fetch(uri, method, options = {}, responseFormat = 'json') {
  try {
    const response = await fetchWithTimeout(uri, { method, ...options });
    if (response.ok) {
      let responseData;
      if (responseFormat === 'json') {
        responseData = await response.json();
      } else if (responseFormat === 'blob') {
        responseData = await response.blob();
      } else {
        responseData = await response.text();
      }
      return { status: '200', data: responseData, headers: response.headers };
    }
    return { status: response.status.toString(), data: null, headers: response.headers };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { status: 'timeout', data: error, headers: null };
    }
    if (error.code === 'ECONNREFUSED') {
      return { status: 'connectionRefused', data: error, headers: null };
    }
    if (error.code === 'ECONNRESET') {
      return { status: 'connectionReset', data: error, headers: null };
    }
    if (error.code === 'ETIMEDOUT') {
      return { status: 'connectionTimeout', data: error, headers: null };
    }
    return { status: 'unknownError', data: error, headers: null };
  }
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_FETCH_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await nodeFetch(resource, {
    ...options,
    signal: controller.signal,
    agent
  });
  clearTimeout(id);
  return response;
}
