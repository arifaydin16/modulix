import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DatabaseConfig {
  database?: 'postgresql' | 'mysql';
  port?: number;
  user?: string;
  password?: string;
}

export interface Folder {
  name: string,
  path: string
}
export interface Config {
  db?: DatabaseConfig;
  cwd?: string;
  modules?: string[];
  active_modules?: string[];
  includes?:string[],
  excludes?:string[],
  folders?: Folder[];
  backupBeforeSync?:boolean;
}

export class ConfigManager {
  private static getPaths() {
    const localDir = path.join(process.cwd(), '.modulix');
    const localFile = path.join(localDir, 'config.json');
    if (fs.existsSync(localFile)) {
      return { configDir: localDir, configFile: localFile, isLocal: true };
    }
    const globalDir = path.join(os.homedir(), '.modulix');
    const globalFile = path.join(globalDir, 'config.json');
    return { configDir: globalDir, configFile: globalFile, isLocal: false };
  }

  static initLocal(): { success: boolean; message: string } {
    const localDir = path.join(process.cwd(), '.modulix');
    const localFile = path.join(localDir, 'config.json');
    if (fs.existsSync(localFile)) {
      return { success: false, message: 'Local configuration already initialized.' };
    }
    try {
      fs.mkdirSync(localDir, { recursive: true });
      const defaultConfig: Config = {
        cwd: '.',
        includes: [],
        excludes: ['node_modules', '.git', 'dist', '.modulix', 'backups'],
        modules: [],
        active_modules: []
      };
      fs.writeFileSync(localFile, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return { success: true, message: `Local configuration initialized at ${localFile}` };
    } catch (err: any) {
      return { success: false, message: `Failed to initialize local config: ${err.message}` };
    }
  }

  static get(): Config {
    try {
      const { configFile } = this.getPaths();
      if (!fs.existsSync(configFile)) {
        return {};
      }
      const data = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(data) as Config;
    } catch (err) {
      return {};
    }
  }
  static setModules(modules: string[]) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules });
  }
  static addModules(modules: string | string[]) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules: Array.isArray(modules) ? [...(currentConfig.modules || []), ...modules] : [...(currentConfig.modules || []), modules] });
  }
  static addFolders(folders: Folder | Folder[]) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders: Array.isArray(folders) ? [...(currentConfig.folders || []), ...folders] : [...(currentConfig.folders || []), folders] });
  }
  static setFolders(folders: Folder[]) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders: folders });
  }
  static enableModule(moduleName: string) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    if (!active.includes(moduleName)) {
      this.set({ ...currentConfig, active_modules: [...active, moduleName] });
    }
  }
  static disableModule(moduleName: string) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    this.set({ ...currentConfig, active_modules: active.filter(m => m !== moduleName) });
  }
  static addIncludes(includes: string | string[]) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const newItems = Array.isArray(includes) ? includes : [includes];
    const updated = Array.from(new Set([...currentIncludes, ...newItems]));
    this.set({ ...currentConfig, includes: updated });
  }
  static removeIncludes(includes: string | string[]) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const itemsToRemove = Array.isArray(includes) ? includes : [includes];
    const updated = currentIncludes.filter(item => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, includes: updated });
  }
  static addExcludes(excludes: string | string[]) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const newItems = Array.isArray(excludes) ? excludes : [excludes];
    const updated = Array.from(new Set([...currentExcludes, ...newItems]));
    this.set({ ...currentConfig, excludes: updated });
  }
  static removeExcludes(excludes: string | string[]) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const itemsToRemove = Array.isArray(excludes) ? excludes : [excludes];
    const updated = currentExcludes.filter(item => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, excludes: updated });
  }
  static set(newConfig: Config): void {
    try {
      const { configDir, configFile } = this.getPaths();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const currentConfig = this.get();

      const mergedDb = newConfig.db
        ? { ...currentConfig.db, ...newConfig.db }
        : currentConfig.db;

      const updated: Config = {
        ...currentConfig,
        ...newConfig,
      };

      if (mergedDb) {
        updated.db = mergedDb;
      }

      fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      console.error('An error occurred while writing to the configuration file:', err);
    }
  }

  static getFilePath(): string {
    return this.getPaths().configFile;
  }
}
