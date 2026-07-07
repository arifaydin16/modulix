#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { intro, outro, spinner, text, select, isCancel, cancel, multiselect } from "@clack/prompts";
import pc from "picocolors";

// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
var ConfigManager = class {
  static getPaths() {
    const localDir = path.join(process.cwd(), ".modularization");
    const localFile = path.join(localDir, "config.json");
    if (fs.existsSync(localFile)) {
      return { configDir: localDir, configFile: localFile, isLocal: true };
    }
    const globalDir = path.join(os.homedir(), ".modularization");
    const globalFile = path.join(globalDir, "config.json");
    return { configDir: globalDir, configFile: globalFile, isLocal: false };
  }
  static initLocal() {
    const localDir = path.join(process.cwd(), ".modularization");
    const localFile = path.join(localDir, "config.json");
    if (fs.existsSync(localFile)) {
      return { success: false, message: "Local configuration already initialized." };
    }
    try {
      fs.mkdirSync(localDir, { recursive: true });
      const defaultConfig = {
        cwd: ".",
        includes: [],
        excludes: ["node_modules", ".git", "dist", ".modularization", "backups"],
        modules: [],
        active_modules: []
      };
      fs.writeFileSync(localFile, JSON.stringify(defaultConfig, null, 2), "utf-8");
      return { success: true, message: `Local configuration initialized at ${localFile}` };
    } catch (err) {
      return { success: false, message: `Failed to initialize local config: ${err.message}` };
    }
  }
  static get() {
    try {
      const { configFile } = this.getPaths();
      if (!fs.existsSync(configFile)) {
        return {};
      }
      const data = fs.readFileSync(configFile, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }
  static setModules(modules) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules });
  }
  static addModules(modules) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules: Array.isArray(modules) ? [...currentConfig.modules || [], ...modules] : [...currentConfig.modules || [], modules] });
  }
  static addFolders(folders) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders: Array.isArray(folders) ? [...currentConfig.folders || [], ...folders] : [...currentConfig.folders || [], folders] });
  }
  static setFolders(folders) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders });
  }
  static enableModule(moduleName) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    if (!active.includes(moduleName)) {
      this.set({ ...currentConfig, active_modules: [...active, moduleName] });
    }
  }
  static disableModule(moduleName) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    this.set({ ...currentConfig, active_modules: active.filter((m) => m !== moduleName) });
  }
  static addIncludes(includes) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const newItems = Array.isArray(includes) ? includes : [includes];
    const updated = Array.from(/* @__PURE__ */ new Set([...currentIncludes, ...newItems]));
    this.set({ ...currentConfig, includes: updated });
  }
  static removeIncludes(includes) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const itemsToRemove = Array.isArray(includes) ? includes : [includes];
    const updated = currentIncludes.filter((item) => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, includes: updated });
  }
  static addExcludes(excludes) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const newItems = Array.isArray(excludes) ? excludes : [excludes];
    const updated = Array.from(/* @__PURE__ */ new Set([...currentExcludes, ...newItems]));
    this.set({ ...currentConfig, excludes: updated });
  }
  static removeExcludes(excludes) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const itemsToRemove = Array.isArray(excludes) ? excludes : [excludes];
    const updated = currentExcludes.filter((item) => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, excludes: updated });
  }
  static set(newConfig) {
    try {
      const { configDir, configFile } = this.getPaths();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      const currentConfig = this.get();
      const mergedDb = newConfig.db ? { ...currentConfig.db, ...newConfig.db } : currentConfig.db;
      const updated = {
        ...currentConfig,
        ...newConfig
      };
      if (mergedDb) {
        updated.db = mergedDb;
      }
      fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), "utf-8");
    } catch (err) {
      console.error("An error occurred while writing to the configuration file:", err);
    }
  }
  static getFilePath() {
    return this.getPaths().configFile;
  }
};

// src/templates.ts
import fs2 from "fs";
import path3 from "path";
import os2 from "os";

// src/utils.ts
import { readdir, stat } from "fs/promises";
import path2 from "path";
async function readAllFiles(dirPath, includes = [], excludes = []) {
  let files = await readdir(dirPath, { withFileTypes: true });
  let fileList = [];
  if (includes.length > 0) {
    files = files.filter((file) => includes.includes(file.name) || includes.includes(path2.extname(file.name)));
  }
  if (excludes.length > 0) {
    files = files.filter((file) => !excludes.includes(file.name) && !excludes.includes(path2.extname(file.name)));
  }
  await Promise.all(files.map(async (file) => {
    const filePath = path2.join(dirPath, file.name);
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const nestedFiles = await readAllFiles(filePath, includes, excludes);
      fileList.push(...nestedFiles);
    } else {
      fileList.push(filePath);
    }
  }));
  return fileList;
}
function validateModuleTags(content, filePath) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, fullTag, index: match.index });
    } else {
      if (stack.length === 0) {
        throw new Error(`No opening tag found for closing tag: "${fullTag}" -> File: ${filePath}`);
      }
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey !== tagKey) {
        throw new Error(`Tag match error! Tag "${lastOpen.fullTag}" cannot be closed with "${fullTag}". -> File: ${filePath}`);
      }
    }
  }
  if (stack.length > 0) {
    const unclosed = stack.map((s) => s.fullTag).join(", ");
    throw new Error(`Unclosed module blocks found: [${unclosed}] -> File: ${filePath}`);
  }
}
function extractBlockedContent(content) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const blocks = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, index: match.index, fullTag });
    } else {
      if (stack.length === 0) {
        continue;
      }
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        if (stack.length === 0) {
          let blockStart = lastOpen.index;
          let blockEnd = match.index + fullTag.length;
          let i = blockStart - 1;
          while (i >= 0 && (content[i] === " " || content[i] === "	")) {
            i--;
          }
          if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
            blockStart = i - 1;
          } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
            blockStart = i - 1;
          }
          let j = blockEnd;
          while (j < content.length && (content[j] === " " || content[j] === "	")) {
            j++;
          }
          if (j + 1 < content.length && content[j] === "*" && content[j + 1] === "/") {
            blockEnd = j + 2;
          }
          blocks.push({ start: blockStart, end: blockEnd });
        }
      }
    }
  }
  if (blocks.length === 0) {
    return "";
  }
  return blocks.map((b) => content.substring(b.start, b.end)).join("\n\n");
}
function parseBlocks(content) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const blocksMap = /* @__PURE__ */ new Map();
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, contentStartIndex: match.index + fullTag.length });
    } else {
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        let closingCommentStart = match.index;
        let i = closingCommentStart - 1;
        while (i >= 0 && (content[i] === " " || content[i] === "	")) {
          i--;
        }
        if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
          closingCommentStart = i - 1;
        } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
          closingCommentStart = i - 1;
        }
        let indentStart = closingCommentStart;
        while (indentStart > 0 && (content[indentStart - 1] === " " || content[indentStart - 1] === "	")) {
          indentStart--;
        }
        if (indentStart > 0 && content[indentStart - 1] === "\n") {
          closingCommentStart = indentStart;
        }
        const blockContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
        blocksMap.set(tagKey, blockContent);
      }
    }
  }
  return blocksMap;
}
function syncBlocksInContent(content, templateBlocks, activeModules) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const replacements = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({
        tagKey,
        moduleName,
        contentStartIndex: match.index + fullTag.length
      });
    } else {
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        if (stack.length === 0) {
          let closingCommentStart = match.index;
          let i = closingCommentStart - 1;
          while (i >= 0 && (content[i] === " " || content[i] === "	")) {
            i--;
          }
          if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
            closingCommentStart = i - 1;
          } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
            closingCommentStart = i - 1;
          }
          let indentStart = closingCommentStart;
          while (indentStart > 0 && (content[indentStart - 1] === " " || content[indentStart - 1] === "	")) {
            indentStart--;
          }
          if (indentStart > 0 && content[indentStart - 1] === "\n") {
            closingCommentStart = indentStart;
          }
          const isActive = activeModules.includes(lastOpen.moduleName);
          let newInnerContent = "";
          if (isActive) {
            if (templateBlocks.has(tagKey)) {
              newInnerContent = templateBlocks.get(tagKey);
            } else {
              newInnerContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
            }
          } else {
            const originalInner = content.substring(lastOpen.contentStartIndex, closingCommentStart);
            if (originalInner.includes("\n")) {
              newInnerContent = "\n";
            } else {
              newInnerContent = "";
            }
          }
          replacements.push({
            start: lastOpen.contentStartIndex,
            end: closingCommentStart,
            newContent: newInnerContent
          });
        }
      }
    }
  }
  replacements.sort((a, b) => b.start - a.start);
  let updatedContent = content;
  for (const rep of replacements) {
    updatedContent = updatedContent.substring(0, rep.start) + rep.newContent + updatedContent.substring(rep.end);
  }
  return updatedContent;
}

// src/templates.ts
var TemplateManager = class {
  static getTemplatesDir() {
    const localDir = path3.join(process.cwd(), ".modularization");
    const localFile = path3.join(localDir, "config.json");
    if (fs2.existsSync(localFile)) {
      return path3.join(localDir, "templates");
    }
    return path3.join(os2.homedir(), ".modularization", "templates");
  }
  static get templatesDir() {
    return this.getTemplatesDir();
  }
  static async add(templateName) {
    const config2 = ConfigManager.get();
    const sourceDir = config2.cwd || process.cwd();
    const targetDir = path3.join(this.templatesDir, templateName);
    if (!fs2.existsSync(sourceDir)) {
      return { success: false, message: `Resource directory does not exist: ${sourceDir}` };
    }
    if (fs2.existsSync(targetDir)) {
      return { success: false, message: `"${templateName}" template already exists.` };
    }
    const includes = config2.includes || [];
    const excludes = config2.excludes && config2.excludes.length > 0 ? config2.excludes : ["node_modules", ".git", "dist", ".modularization", "backups"];
    try {
      const files = await readAllFiles(sourceDir, includes, excludes);
      const fileContents = [];
      for (const filePath of files) {
        const content = fs2.readFileSync(filePath, "utf-8");
        validateModuleTags(content, filePath);
        fileContents.push({ filePath, content });
      }
      let copiedFilesCount = 0;
      for (const { filePath, content } of fileContents) {
        const extracted = extractBlockedContent(content);
        if (extracted.trim().length > 0) {
          const relativePath = path3.relative(sourceDir, filePath);
          const targetPath = path3.join(targetDir, relativePath);
          fs2.mkdirSync(path3.dirname(targetPath), { recursive: true });
          fs2.writeFileSync(targetPath, extracted, "utf-8");
          copiedFilesCount++;
        }
      }
      if (copiedFilesCount === 0) {
        return {
          success: false,
          message: "No files containing module tags(@<module> <block>) found in the project."
        };
      }
      return {
        success: true,
        message: `"${templateName}" template created successfully! ${copiedFilesCount} files copied.`
      };
    } catch (err) {
      if (fs2.existsSync(targetDir)) {
        fs2.rmSync(targetDir, { recursive: true, force: true });
      }
      return { success: false, message: `Error occurred: ${err.message}` };
    }
  }
  static list() {
    if (!fs2.existsSync(this.templatesDir)) {
      return [];
    }
    return fs2.readdirSync(this.templatesDir).filter((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      return fs2.statSync(fullPath).isDirectory();
    });
  }
  static listWithDates() {
    if (!fs2.existsSync(this.templatesDir)) {
      return [];
    }
    return fs2.readdirSync(this.templatesDir).filter((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      return fs2.statSync(fullPath).isDirectory();
    }).map((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      const stats = fs2.statSync(fullPath);
      return {
        name: file,
        birthtime: stats.birthtime
      };
    });
  }
  static remove(templateNames) {
    let successCount = 0;
    const failed = [];
    for (const name of templateNames) {
      const targetPath = path3.join(this.templatesDir, name);
      try {
        if (fs2.existsSync(targetPath)) {
          fs2.rmSync(targetPath, { recursive: true, force: true });
          successCount++;
        } else {
          failed.push(name);
        }
      } catch (err) {
        failed.push(name);
      }
    }
    return { successCount, failed };
  }
};

// src/cli.ts
import process2 from "process";
import { readFile, mkdir, writeFile } from "fs/promises";
import path4 from "path";
import { existsSync } from "fs";
var program = new Command();
program.name("modulix").description("A global CLI tool for modularization").version("1.0.0");
var configCmd = program.command("config").description("Manage configuration settings");
var modulesCmd = program.command("modules").description("Manage module configurations");
var setCmd = configCmd.command("set").description("Set a configuration parameter");
modulesCmd.command("clear").description("Clear all configured modules").action(() => {
  ConfigManager.setModules([]);
  outro(pc.green(`All modules have been cleared from configuration. (${ConfigManager.getFilePath()})`));
});
modulesCmd.command("remove").description("Remove specific modules from the configuration").action(async () => {
  const config2 = ConfigManager.get();
  const modules = config2.modules || [];
  if (modules.length === 0) {
    outro(pc.yellow("No modules configured."));
    return;
  }
  const selectResult = await multiselect({
    message: "Select modules to remove:",
    options: modules.map((module) => ({ value: module, label: module })),
    required: false
  });
  if (isCancel(selectResult)) {
    cancel("Operation canceled by the user.");
    process2.exit(0);
  }
  if (typeof selectResult === "symbol") {
    cancel("Operation canceled by the user.");
    process2.exit(0);
  }
  const selectedModules = selectResult;
  if (selectedModules.length === 0) {
    outro(pc.yellow("No modules selected for removal."));
    return;
  }
  const updatedModules = modules.filter((module) => !selectedModules.includes(module));
  ConfigManager.setModules(updatedModules);
  outro(pc.green(`Modules removed from configuration: ${selectedModules.join(", ")} (${ConfigManager.getFilePath()})`));
});
modulesCmd.command("list").description("List all configured modules").action(() => {
  const config2 = ConfigManager.get();
  const modules = config2.modules || [];
  const active = config2.active_modules || [];
  if (modules.length === 0) {
    outro(pc.yellow("No modules configured."));
  } else {
    const listStr = modules.map((m) => {
      if (active.includes(m)) {
        return pc.green(`${m} (active)`);
      } else {
        return pc.red(`${m} (disabled)`);
      }
    }).join(", ");
    outro(`Configured modules: ${listStr}`);
  }
});
modulesCmd.command("add").description("Add modules to the configuration").action(
  async () => {
    const moduleNamesInput = await text({
      message: "Enter module names (comma-separated):",
      placeholder: "module1,module2,module3",
      validate(value) {
        if (value.trim().length === 0) return "Module names cannot be empty!";
      }
    });
    if (isCancel(moduleNamesInput)) {
      cancel("Operation canceled by the user.");
      process2.exit(0);
    }
    const moduleNames = moduleNamesInput.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
    if (moduleNames.length === 0) {
      outro(pc.red("Error: No valid module names provided."));
      process2.exit(1);
    }
    ConfigManager.addModules(moduleNames);
    outro(pc.green(`Modules successfully added to configuration: ${moduleNames.join(", ")} (${ConfigManager.getFilePath()})`));
  }
);
modulesCmd.command("enable").argument("<module>", "Module name").description("Enable a module").action((moduleName) => {
  ConfigManager.enableModule(moduleName);
  outro(pc.green(`Module "${moduleName}" has been enabled.`));
});
modulesCmd.command("disable").argument("<module>", "Module name").description("Disable a module").action((moduleName) => {
  ConfigManager.disableModule(moduleName);
  outro(pc.green(`Module "${moduleName}" has been disabled.`));
});
modulesCmd.command("sync").description("Synchronize module folders").action(async () => {
  const config2 = ConfigManager.get();
  if (config2.cwd === void 0) {
    outro(pc.red("Error: Please define cwd (project root directory) in configuration before synchronizing folders. \nmdl config set cwd --path <your_project_root_directory>"));
    process2.exit(1);
  }
  const templates = TemplateManager.listWithDates();
  if (templates.length === 0) {
    outro(pc.red("Error: No templates found. Please add a template first: \nmdl templates add <templateName>"));
    process2.exit(1);
  }
  const formatDate = (date) => {
    const pad = (num) => String(num).padStart(2, "0");
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };
  const selectedTemplateName = await select({
    message: "Select a template:",
    options: templates.map((t) => ({
      value: t.name,
      label: `${t.name} (Created At: ${formatDate(t.birthtime)})`
    }))
  });
  if (isCancel(selectedTemplateName) || typeof selectedTemplateName === "symbol") {
    cancel("Operation canceled.");
    process2.exit(0);
  }
  let backupName = "";
  if (config2.backupBeforeSync) {
    const nameInput = await text({
      message: "Please enter a name for the backup:",
      placeholder: "v1.0.0-before-sync",
      validate(value) {
        if (value.length === 0) return "Backup name cannot be empty!";
        if (/[\\/:*?"<>|]/.test(value)) return "Contains invalid folder name characters!";
      }
    });
    if (isCancel(nameInput)) {
      cancel("Operation canceled by the user.");
      process2.exit(0);
    }
    backupName = nameInput;
  }
  const s = spinner();
  s.start("Synchronizing module files...");
  try {
    const backupRoot = path4.join(process2.cwd(), "backups");
    const includes = config2.includes || [];
    const excludes = config2.excludes && config2.excludes.length > 0 ? config2.excludes : ["node_modules", ".git", "dist", ".modularization", "backups"];
    const files = await readAllFiles(config2.cwd, includes, excludes);
    const activeModules = config2.active_modules || [];
    const templateDir = path4.join(TemplateManager.getTemplatesDir(), selectedTemplateName);
    let updatedFilesCount = 0;
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const relativePath = path4.relative(config2.cwd, file);
      validateModuleTags(content, file);
      if (config2.backupBeforeSync && backupName) {
        const backupFilePath = path4.join(backupRoot, backupName, relativePath);
        await mkdir(path4.dirname(backupFilePath), { recursive: true });
        await writeFile(backupFilePath, content, "utf-8");
      }
      const templateFilePath = path4.join(templateDir, relativePath);
      let templateBlocks = /* @__PURE__ */ new Map();
      if (existsSync(templateFilePath)) {
        const templateContent = await readFile(templateFilePath, "utf-8");
        templateBlocks = parseBlocks(templateContent);
      }
      const updatedContent = syncBlocksInContent(content, templateBlocks, activeModules);
      if (updatedContent !== content) {
        await writeFile(file, updatedContent, "utf-8");
        updatedFilesCount++;
      }
    }
    s.stop(`Synchronization complete! Number of updated files: ${updatedFilesCount}`);
    outro(pc.green("\u{1F389} Synchronization completed successfully."));
  } catch (err) {
    s.stop(`Error: ${err.message}`);
    outro(pc.red("\u274C Synchronization could not be completed."));
    process2.exit(1);
  }
});
setCmd.command("db").description("Set database connection settings").option("-d, --database <type>", "Database selection (postgresql, mysql)").option("-p, --port <number>", "Port number").option("-u, --user <username>", "User name").option("-pass, --password <password>", "Password").action(async (options) => {
  intro(pc.cyan(" mdl config set db "));
  let database = options.database;
  let port = options.port;
  let user = options.user;
  let password = options.password;
  if (!database) {
    const selectResult = await select({
      message: "Database Selection:",
      options: [
        { value: "postgresql", label: "PostgreSQL" },
        { value: "mysql", label: "MySQL" }
      ]
    });
    if (typeof selectResult === "symbol") {
      outro(pc.red("Operation canceled."));
      process2.exit(0);
    }
    database = selectResult;
  } else {
    database = database.toLowerCase();
    if (database !== "postgresql" && database !== "mysql") {
      outro(pc.red("Error: Only postgresql or mysql can be selected."));
      process2.exit(1);
    }
  }
  const defaultPort = database === "postgresql" ? "5432" : "3306";
  if (!port) {
    const portResult = await text({
      message: `Port (Default: ${defaultPort}):`,
      placeholder: defaultPort,
      validate(value) {
        if (value.trim() !== "" && isNaN(Number(value))) {
          return "Port number must be a number!";
        }
      }
    });
    if (typeof portResult === "symbol") {
      outro(pc.red("Operation canceled."));
      process2.exit(0);
    }
    port = portResult.trim() === "" ? Number(defaultPort) : Number(portResult);
  } else {
    port = Number(port);
    if (isNaN(port)) {
      outro(pc.red("Error: Port must be a valid number."));
      process2.exit(1);
    }
  }
  if (!user) {
    const userResult = await text({
      message: "User:",
      placeholder: "root",
      validate(value) {
        if (value.trim().length === 0) return "Username cannot be empty!";
      }
    });
    if (typeof userResult === "symbol") {
      outro(pc.red("Operation canceled."));
      process2.exit(0);
    }
    user = userResult;
  }
  if (password === void 0) {
    const passResult = await text({
      message: "Password:",
      placeholder: "password"
    });
    if (typeof passResult === "symbol") {
      outro(pc.red("Operation canceled."));
      process2.exit(0);
    }
    password = passResult;
  }
  ConfigManager.set({
    db: {
      database,
      port: Number(port),
      user,
      password
    }
  });
  outro(pc.green(`Database informations saved! (${ConfigManager.getFilePath()})`));
});
setCmd.command("folder").option("--path <path>", "Project target folder path").description("Set project folder structure").action(async (options) => {
  intro(pc.cyan(" mdl config set folder "));
  let folderPath = options.path;
  const rand = Math.ceil(Math.random() * 1e3);
  let folderName = options.path ? options.path.split("/").pop() || `unnamed-folder-${rand}` : `unnamed-folder-${rand}`;
  if (!folderPath) {
    const defaultPath = process2.cwd();
    const pathResult = await text({
      message: "Project target folder:",
      placeholder: defaultPath
    });
    if (typeof pathResult === "symbol") {
      outro(pc.red("Process canceled."));
      process2.exit(0);
    }
    folderPath = pathResult.trim() === "" ? defaultPath : pathResult;
  }
  ConfigManager.addFolders({
    name: folderName,
    path: folderPath
  });
  outro(pc.green(`\u{1F389} Project target folder successfully saved: ${folderPath} (${ConfigManager.getFilePath()})`));
});
setCmd.command("cwd").description("Set project root directory").option("--path <path>", "Project root directory path").action(async (options) => {
  intro(pc.cyan(" mdl config set cwd "));
  let projectPath = options.path;
  if (!projectPath) {
    const defaultPath = process2.cwd();
    const pathResult = await text({
      message: "Project root directory:",
      placeholder: defaultPath
    });
    if (typeof pathResult === "symbol") {
      outro(pc.red("Operation canceled."));
      process2.exit(0);
    }
    projectPath = pathResult.trim() === "" ? defaultPath : pathResult;
  }
  ConfigManager.set({
    cwd: projectPath
  });
  outro(pc.green(`\u{1F389} Working directory successfully saved: ${projectPath} (${ConfigManager.getFilePath()})`));
});
var includesCmd = setCmd.command("includes").description("Manage included files/folders");
includesCmd.command("add").argument("<item>", "File/folder pattern to include").description("Add a pattern to includes").action((item) => {
  ConfigManager.addIncludes(item);
  outro(pc.green(`"${item}" has been added to includes. (${ConfigManager.getFilePath()})`));
});
includesCmd.command("remove").argument("<item>", "File/folder pattern to remove").description("Remove a pattern from includes").action((item) => {
  ConfigManager.removeIncludes(item);
  outro(pc.green(`"${item}" has been removed from includes. (${ConfigManager.getFilePath()})`));
});
var excludesCmd = setCmd.command("excludes").description("Manage excluded files/folders");
excludesCmd.command("add").argument("<item>", "File/folder pattern to exclude").description("Add a pattern to excludes").action((item) => {
  ConfigManager.addExcludes(item);
  outro(pc.green(`"${item}" has been added to excludes. (${ConfigManager.getFilePath()})`));
});
excludesCmd.command("remove").argument("<item>", "File/folder pattern to remove").description("Remove a pattern from excludes").action((item) => {
  ConfigManager.removeExcludes(item);
  outro(pc.green(`"${item}" has been removed from excludes. (${ConfigManager.getFilePath()})`));
});
configCmd.command("show").description("Show current configuration").action(() => {
  const configData = ConfigManager.get();
  intro(pc.cyan(" Current Configuration "));
  console.log(JSON.stringify(configData, null, 2));
  outro(pc.green(`Configuration path: ${ConfigManager.getFilePath()}`));
});
program.command("init").description("Initialize local configuration in the current directory").action(() => {
  intro(pc.cyan(" mdl init "));
  const result = ConfigManager.initLocal();
  if (result.success) {
    outro(pc.green(`\u{1F389} ${result.message}`));
  } else {
    outro(pc.red(`\u274C ${result.message}`));
  }
});
var templatesCmd = program.command("templates").description("Manage template configurations");
templatesCmd.command("add").argument("<templateName>", "Template name").description("Add a new template based on module blocks").action(async (templateName) => {
  intro(pc.cyan(" mdl templates add "));
  const s = spinner();
  s.start(`Creating template "${templateName}"...`);
  const result = await TemplateManager.add(templateName);
  if (result.success) {
    s.stop(pc.green(result.message));
    outro(pc.green("\u{1F389} Template addition completed!"));
  } else {
    s.stop(pc.red(result.message));
    outro(pc.red("\u274C Could not add template."));
    process2.exit(1);
  }
});
templatesCmd.command("list").description("List all available templates").action(() => {
  intro(pc.cyan(" mdl templates list "));
  const list = TemplateManager.list();
  if (list.length === 0) {
    outro(pc.yellow("No templates found."));
  } else {
    outro(pc.green(`Available Templates:
${list.map((t) => `  - ${t}`).join("\n")}`));
  }
});
templatesCmd.command("remove").description("Remove templates using multi-select").action(async () => {
  intro(pc.cyan(" mdl templates remove "));
  const list = TemplateManager.list();
  if (list.length === 0) {
    outro(pc.yellow("No templates to delete found."));
    return;
  }
  const selectResult = await multiselect({
    message: "Select templates you want to delete:",
    options: list.map((t) => ({ value: t, label: t })),
    required: false
  });
  if (isCancel(selectResult) || typeof selectResult === "symbol") {
    outro(pc.red("Operation canceled."));
    process2.exit(0);
  }
  const selectedTemplates = selectResult;
  if (selectedTemplates.length === 0) {
    outro(pc.yellow("No templates selected for deletion."));
    return;
  }
  const s = spinner();
  s.start("Deleting selected templates...");
  const result = TemplateManager.remove(selectedTemplates);
  s.stop(`Number of deleted templates: ${result.successCount}`);
  if (result.failed.length > 0) {
    outro(pc.red(`Could not delete templates: ${result.failed.join(", ")}`));
  } else {
    outro(pc.green("\u{1F389} All selected templates deleted successfully!"));
  }
});
program.action(() => {
  program.outputHelp();
});
program.parse(process2.argv);
//# sourceMappingURL=cli.js.map