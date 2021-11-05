import { createLogger } from "./lib/loggerlib.js";

const log = createLogger();

export function create() {
  const now = new Date();
  const timer = {
    startDate: now,
    lastDate: now,
  };

  return {
    startDate: timer.startDate,
    lastDate: timer.startDate,
    getSeconds: () => {
      return ((new Date()).getTime() - timer.startDate.getTime()) / 1000;
    },
    ping: (text = 'Duration') => {
      const duration = ((new Date()).getTime() - timer.lastDate.getTime()) / 1000;
      timer.lastDate = new Date();
      log.info(`${text}: ${duration} secs`);
    },
    duration: () => {
      const duration = ((new Date()).getTime() - timer.lastDate.getTime()) / 1000;
      timer.lastDate = new Date();
      return duration;
    }
  };
}
