import { deleteFile, deleteSpecificFilesInFolder, getFilesInFolder } from "./fileUtils.js";

export function cleanHtmlFiles(config) {
  cleanFiles(`${config.baseDataFolder}projects/`, '.html');
}

export function cleanProjectHtmlFiles(config, projectId, prefix) {
  deleteSpecificFilesInFolder(`${config.baseDataFolder}projects/${projectId}/`, prefix, '.html');
}

export function cleanCacheFiles(config) {
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
