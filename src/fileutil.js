/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import fs from "fs";
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

export function toAbsFilepath(path) {
  return join(__dirname, path);
}

export function currentDir() {
  return __dirname;
}

export function readFile(path, encoding = 'utf8') {
  return fs.readFileSync(path, encoding);
}

export function writeFile(path, data) {
  fs.writeFileSync(path, data);
}

export function fileExists(path) {
  return fs.existsSync(path);
}

export function readJSONFile(path) {
  if (fileExists(path)) {
    return JSON.parse(readFile(path));
  } else {
    throw new Error('File does not exist!');
  }
}

export function importJSONFile(path) {
  return require(path);
}

export function writeJSONFile(path, data) {
  writeFile(path, JSON.stringify(data, null, 2));
}
