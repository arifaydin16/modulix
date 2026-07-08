
export interface ModulerizeOptions {
  name: string;
  path?: string;
}

export function modulerize(options: ModulerizeOptions) {
  return {
    success: true,
    message: `Module "${options.name}" has been processed.`,
    options,
  };
}

export * from './config.js';
export * from './templates.js';
export * from './utils.js';
export * from './backup.js';
export * from './module.js';
