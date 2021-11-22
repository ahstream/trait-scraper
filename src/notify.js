import open from "open";

import { toAbsFilepath } from "./fileUtils.js";

export function notifyRevealed() {
  open(toAbsFilepath('./audio/reveal-notification.mp3'), { app: { name: 'firefox' } });
}

export function notifyNewResults() {
  open(toAbsFilepath('./audio/new-results-notification.mp3'), { app: { name: 'firefox' } });
}

export function notifyHotToken() {
  // open(toAbsFilepath('./audio/new-results-notification.mp3'), { app: { name: 'firefox' } });
}
