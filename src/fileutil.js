/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function toAbsoluteFilePath(filePath) {
  return join(__dirname, filePath);
}

export function absFilePath(filePath) {
  return join(__dirname, filePath);
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

export function readRelativeFile(path, encoding = 'utf8') {
  return fs.readFileSync(join(__dirname, path), encoding);
}

export function writeRelativeFile(path, data) {
  fs.writeFileSync(join(__dirname, path), data);
}

export function fileExists(path) {
  return fs.existsSync(path);
}

export function fileExistsRelPath(path) {
  return fs.existsSync(join(__dirname, path));
}
