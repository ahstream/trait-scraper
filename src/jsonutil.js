/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function importFile(path) {
  return require(path);
}
