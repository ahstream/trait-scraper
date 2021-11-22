/**
 * Copyright (c) 2021
 * FILE DESCRIPTION
 */

import 'winston-daily-rotate-file';

import fs from 'fs';
import util from 'util';
import winston from 'winston';

const DEFAULT_OPTIONS = {
  logLevel: 'info',
  dir: 'logfiles',
  timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: false,
  maxSize: '100M',
  maxFiles: '20',
};

// EXPORTED FUNCTIONS

export const log = createLogger();

export function createLogger(customOptions) {
  const options = { ...DEFAULT_OPTIONS, ...customOptions };

  options.dir = trimCharsRight(options.dir, '/');
  if (!fs.existsSync(options.dir)) {
    fs.mkdirSync(options.dir);
  }

  const utilFormatter = () => {
    return { transform };
  };
  const colorFormatter = winston.format.combine(
    winston.format.timestamp({ format: options.timestampFormat }),
    utilFormatter(),
    winston.format.colorize(),
    winston.format.printf((args) => `${args.timestamp} ${args.label || '-'} ${args.level}: ${args.message}`)
  );

  const noColorFormatter = winston.format.combine(
    winston.format.timestamp({ format: options.timestampFormat }),
    utilFormatter(),
    winston.format.printf((args) => `${args.timestamp} ${args.label || '-'} ${args.level}: ${args.message}`)
  );

  return winston.createLogger({
    level: DEFAULT_OPTIONS.logLevel,
    transports: [
      new winston.transports.Console({
        format: colorFormatter,
        level: options.logLevel
      }),
      new winston.transports.DailyRotateFile({
        filename: `${options.dir}/info-%DATE%.log`,
        datePattern: options.datePattern,
        zippedArchive: options.zippedArchive,
        maxSize: options.maxSize,
        maxFiles: options.maxFiles,
        format: noColorFormatter,
        level: 'info',
      }),
      new winston.transports.DailyRotateFile({
        filename: `${options.dir}/debug-%DATE%.log`,
        datePattern: options.datePattern,
        zippedArchive: options.zippedArchive,
        maxSize: options.maxSize,
        maxFiles: options.maxFiles,
        format: noColorFormatter,
        level: 'debug',
      }),
      new winston.transports.DailyRotateFile({
        filename: `${options.dir}/verbose-%DATE%.log`,
        datePattern: options.datePattern,
        zippedArchive: options.zippedArchive,
        maxSize: options.maxSize,
        maxFiles: options.maxFiles,
        format: noColorFormatter,
        level: 'verbose',
      }),
      new winston.transports.DailyRotateFile({
        filename: `${options.dir}/error-%DATE%.log`,
        datePattern: options.datePattern,
        zippedArchive: options.zippedArchive,
        maxSize: options.maxSize,
        maxFiles: options.maxFiles,
        format: noColorFormatter,
        level: 'error',
      }),
    ]
  });
}

// HELPER FUNCTIONS

function transform(info, _opts) {
  const args = info[Symbol.for('splat')];
  if (args) {
    info.message = util.format(info.message, ...args);
  } else if (typeof info.message === 'object') {
    info.message = util.format(info.message, '');
  }
  return info;
}

export function trimCharsRight(str, charlist) {
  return str.replace(new RegExp(`[${charlist}]+$`), '');
}
