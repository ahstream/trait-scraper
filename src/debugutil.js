import * as fileutil from "./fileutil.js";

export function debugToFile(config, filename = 'debug.json') {
  if (config.projectId) {
    fileutil.writeRelativeFile(`../config/projects/${config.projectId}/${filename}`, JSON.stringify({ debug: config }, null, 2));
  } else {
    fileutil.writeRelativeFile(`../config/${filename}`, JSON.stringify({ debug: config }, null, 2));
  }
}
