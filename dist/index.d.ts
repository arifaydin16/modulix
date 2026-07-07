interface DatabaseConfig {
    database?: 'postgresql' | 'mysql';
    port?: number;
    user?: string;
    password?: string;
}
interface Folder {
    name: string;
    path: string;
}
interface Config {
    db?: DatabaseConfig;
    cwd?: string;
    modules?: string[];
    active_modules?: string[];
    includes?: string[];
    excludes?: string[];
    folders?: Folder[];
    backupBeforeSync?: boolean;
}
declare class ConfigManager {
    private static getPaths;
    static initLocal(): {
        success: boolean;
        message: string;
    };
    static get(): Config;
    static setModules(modules: string[]): void;
    static addModules(modules: string | string[]): void;
    static addFolders(folders: Folder | Folder[]): void;
    static setFolders(folders: Folder[]): void;
    static enableModule(moduleName: string): void;
    static disableModule(moduleName: string): void;
    static addIncludes(includes: string | string[]): void;
    static removeIncludes(includes: string | string[]): void;
    static addExcludes(excludes: string | string[]): void;
    static removeExcludes(excludes: string | string[]): void;
    static set(newConfig: Config): void;
    static getFilePath(): string;
}

declare class TemplateManager {
    static getTemplatesDir(): string;
    private static get templatesDir();
    static add(templateName: string): Promise<{
        success: boolean;
        message: string;
    }>;
    static list(): string[];
    static listWithDates(): {
        name: string;
        birthtime: Date;
    }[];
    static remove(templateNames: string[]): {
        successCount: number;
        failed: string[];
    };
}

declare function readAllFiles(dirPath: string, includes?: string[], excludes?: string[]): Promise<string[]>;
declare function validateModuleTags(content: string, filePath: string): void;
declare function extractBlockedContent(content: string): string;
declare function parseBlocks(content: string): Map<string, string>;
declare function syncBlocksInContent(content: string, templateBlocks: Map<string, string>, activeModules: string[]): string;

interface ModulerizeOptions {
    name: string;
    path?: string;
}
declare function modulerize(options: ModulerizeOptions): {
    success: boolean;
    message: string;
    options: ModulerizeOptions;
};

export { type Config, ConfigManager, type DatabaseConfig, type Folder, type ModulerizeOptions, TemplateManager, extractBlockedContent, modulerize, parseBlocks, readAllFiles, syncBlocksInContent, validateModuleTags };
