/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import fs from "fs";
import { createRequire } from 'module';
import { basename, dirname, extname, join, normalize, parse, toNamespacedPath } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

export function currentDir() {
  return __dirname;
}

export function readFile(path, encoding = 'utf8') {
  return fs.readFileSync(path, encoding);
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

export function writeFile(path, data) {
  fs.writeFileSync(path, data);
}

export function writeJSONFile(path, data) {
  writeFile(path, JSON.stringify(data, null, 2));
}

export function deleteFile(path) {
  return fs.unlinkSync(path);
}

export function fileExists(path) {
  return fs.existsSync(path);
}

export function folderExists(path) {
  return fileExists(path);
}

export function getFilesInFolder(path, options) {
  return fs.readdirSync(path, options);
}

export function createFolder(path, recursive = true) {
  fs.mkdirSync(path, { recursive });
}

export function ensureFolder(path, recursive = true) {
  if (!folderExists(path)) {
    createFolder(path, recursive);
  }
  return path;
}

export function toAbsFilepath(path) {
  return join(__dirname, path);
}

export function deleteSpecificFilesInFolder(path, prefix, suffix) {
  if (!folderExists(path)) {
    return false;
  }
  if (!prefix && !suffix) {
    return false;
  }
  const files = fs.readdirSync(path);
  files.forEach(file => {
    if (file.startsWith(prefix) && file.endsWith(suffix)) {
      deleteFile(`${path}${file}`);
    }
  });
}
