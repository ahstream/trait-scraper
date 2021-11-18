import { getFilesInFolder, deleteFile, toAbsFilepath } from "./fileutil.js";

export function cleanHtml(config) {
  cleanFiles(`${config.baseDataFolder}projects/`, '.html');
}

export function cleanCache(config) {
  cleanFiles(`${config.baseDataFolder}projects/`, 'cache.json');
}

export function cleanFiles(folder, filenameSuffix) {
  const allFiles = getFilesInFolder(folder, { withFileTypes: true });
  allFiles.forEach(fileObj => {
    if (!fileObj.isDirectory()) {
      return;
    }
    const folderName = fileObj.name;
    getFilesInFolder(`${folder}${folderName}/`).forEach(fileName => {
      if (fileName.toLowerCase().endsWith(filenameSuffix)) {
        deleteFile(`${folder}${folderName}/${fileName}`);
      }
    });
  });
}


