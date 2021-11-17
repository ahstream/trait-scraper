import open from "open";
import * as fileutil from "./fileutil.js";

export function notifyRevealed() {
  open(fileutil.toAbsFilepath('./audio/reveal-notification.mp3'), { app: { name: 'firefox' } });
}

export function notifyNewResults() {
  open(fileutil.toAbsFilepath('./audio/new-results-notification.mp3'), { app: { name: 'firefox' } });
}
