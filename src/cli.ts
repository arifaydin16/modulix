import { Command } from 'commander';
import { intro, outro, spinner, text, select, isCancel, cancel, multiselect } from '@clack/prompts';
import pc from 'picocolors';
import { ConfigManager, TemplateManager } from './index.js';
import process, { config } from 'node:process';
import { readAllFiles, validateModuleTags, parseBlocks, syncBlocksInContent } from './utils.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';


const program = new Command();

program
  .name('modularization')
  .description('A global CLI tool for modularization')
  .version('1.0.0');

const configCmd = program
  .command('config')
  .description('Manage configuration settings');
const modulesCmd = program
  .command('modules')
  .description('Manage module configurations');

const setCmd = configCmd
  .command('set')
  .description('Set a configuration parameter');


modulesCmd.command('clear')
  .description('Clear all configured modules')
  .action(() => {
    ConfigManager.setModules([]);
    outro(pc.green(`All modules have been cleared from configuration. (${ConfigManager.getFilePath()})`));
  });
modulesCmd.command('remove')
  .description('Remove specific modules from the configuration')
  .action(async () => {
    const config = ConfigManager.get();
    const modules = config.modules || [];
    if (modules.length === 0) {
      outro(pc.yellow('No modules configured.'));
      return;
    }

    const selectResult = await multiselect({
      message: 'Select modules to remove:',
      options: modules.map(module => ({ value: module, label: module })),
      required: false,
    });

    if (isCancel(selectResult)) {
      cancel('Operation canceled by the user.');
      process.exit(0);
    }
    if (typeof selectResult === 'symbol') {
      cancel('Operation canceled by the user.');
      process.exit(0);
    }

    const selectedModules = selectResult as string[];
    if (selectedModules.length === 0) {
      outro(pc.yellow('No modules selected for removal.'));
      return;
    }

    const updatedModules = modules.filter(module => !selectedModules.includes(module));
    ConfigManager.setModules(updatedModules);

    outro(pc.green(`Modules removed from configuration: ${selectedModules.join(', ')} (${ConfigManager.getFilePath()})`));
  });
modulesCmd.command('list')
  .description('List all configured modules')
  .action(() => {
    const config = ConfigManager.get();
    const modules = config.modules || [];
    const active = config.active_modules || [];
    if (modules.length === 0) {
      outro(pc.yellow('No modules configured.'));
    } else {
      const listStr = modules.map(m => {
        if (active.includes(m)) {
          return pc.green(`${m} (active)`);
        } else {
          return pc.red(`${m} (disabled)`);
        }
      }).join(', ');
      outro(`Configured modules: ${listStr}`);
    }
  });
modulesCmd.command('add')
  .description('Add modules to the configuration')
  .action(async () => {
    const moduleNamesInput = await text({
      message: 'Enter module names (comma-separated):',
      placeholder: 'module1,module2,module3',
      validate(value) {
        if (value.trim().length === 0) return 'Module names cannot be empty!';
      },
    });

    if (isCancel(moduleNamesInput)) {
      cancel('Operation canceled by the user.');
      process.exit(0);
    }

    const moduleNames = (moduleNamesInput as string).split(',').map(name => name.trim()).filter(name => name.length > 0);

    if (moduleNames.length === 0) {
      outro(pc.red('Error: No valid module names provided.'));
      process.exit(1);
    }

    ConfigManager.addModules(moduleNames);

    outro(pc.green(`Modules successfully added to configuration: ${moduleNames.join(', ')} (${ConfigManager.getFilePath()})`));
  }
  );
modulesCmd.command('enable')
  .argument('<module>', 'Module name')
  .description('Enable a module')
  .action((moduleName) => {
    ConfigManager.enableModule(moduleName);
    outro(pc.green(`Module "${moduleName}" has been enabled.`));
  });
modulesCmd.command('disable')
  .argument('<module>', 'Module name')
  .description('Disable a module')
  .action((moduleName) => {
    ConfigManager.disableModule(moduleName);
    outro(pc.green(`Module "${moduleName}" has been disabled.`));
  });
modulesCmd.command('sync')
  .description('Synchronize module folders')
  .action(async () => {
    const config = ConfigManager.get();
    if (config.cwd === undefined) {
      outro(pc.red('Error: Please define cwd (project root directory) in configuration before synchronizing folders. \nmdl config set cwd --path <your_project_root_directory>'));
      process.exit(1);
    }

    const templates = TemplateManager.listWithDates();
    if (templates.length === 0) {
      outro(pc.red('Error: No templates found. Please add a template first: \nmdl templates add <templateName>'));
      process.exit(1);
    }

    const formatDate = (date: Date) => {
      const pad = (num: number) => String(num).padStart(2, '0');
      const day = pad(date.getDate());
      const month = pad(date.getMonth() + 1);
      const year = date.getFullYear();
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    };

    const selectedTemplateName = await select({
      message: 'Select a template:',
      options: templates.map(t => ({
        value: t.name,
        label: `${t.name} (Created At: ${formatDate(t.birthtime)})`
      }))
    });

    if (isCancel(selectedTemplateName) || typeof selectedTemplateName === 'symbol') {
      cancel('Operation canceled.');
      process.exit(0);
    }

    let backupName = '';
    if (config.backupBeforeSync) {
      const nameInput = await text({
        message: 'Please enter a name for the backup:',
        placeholder: 'v1.0.0-before-sync',
        validate(value) {
          if (value.length === 0) return 'Backup name cannot be empty!';
          if (/[\\/:*?"<>|]/.test(value)) return 'Contains invalid folder name characters!';
        },
      });

      if (isCancel(nameInput)) {
        cancel('Operation canceled by the user.');
        process.exit(0);
      }

      backupName = nameInput;
    }

    const s = spinner();
    s.start('Synchronizing module files...');

    try {
      const backupRoot = path.join(process.cwd(), 'backups');
      const includes = config.includes || [];
      const excludes = config.excludes && config.excludes.length > 0
        ? config.excludes
        : ['node_modules', '.git', 'dist', '.modularization', 'backups'];

      const files = await readAllFiles(config.cwd!, includes, excludes);
      const activeModules = config.active_modules || [];
      const templateDir = path.join(TemplateManager.getTemplatesDir(), selectedTemplateName as string);

      let updatedFilesCount = 0;

      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        const relativePath = path.relative(config.cwd!, file);

        validateModuleTags(content, file);

        if (config.backupBeforeSync && backupName) {
          const backupFilePath = path.join(backupRoot, backupName, relativePath);
          await mkdir(path.dirname(backupFilePath), { recursive: true });
          await writeFile(backupFilePath, content, 'utf-8');
        }

        const templateFilePath = path.join(templateDir, relativePath);
        let templateBlocks = new Map<string, string>();

        if (existsSync(templateFilePath)) {
          const templateContent = await readFile(templateFilePath, 'utf-8');
          templateBlocks = parseBlocks(templateContent);
        }

        const updatedContent = syncBlocksInContent(content, templateBlocks, activeModules);

        if (updatedContent !== content) {
          await writeFile(file, updatedContent, 'utf-8');
          updatedFilesCount++;
        }
      }

      s.stop(`Synchronization complete! Number of updated files: ${updatedFilesCount}`);
      outro(pc.green('🎉 Synchronization completed successfully.'));
    } catch (err: any) {
      s.stop(`Error: ${err.message}`);
      outro(pc.red('❌ Synchronization could not be completed.'));
      process.exit(1);
    }
  })

setCmd
  .command('db')
  .description('Set database connection settings')
  .option('-d, --database <type>', 'Database selection (postgresql, mysql)')
  .option('-p, --port <number>', 'Port number')
  .option('-u, --user <username>', 'User name')
  .option('-pass, --password <password>', 'Password')
  .action(async (options) => {
    intro(pc.cyan(' mdl config set db '));

    let database = options.database;
    let port = options.port;
    let user = options.user;
    let password = options.password;

    if (!database) {
      const selectResult = await select({
        message: 'Database Selection:',
        options: [
          { value: 'postgresql', label: 'PostgreSQL' },
          { value: 'mysql', label: 'MySQL' },
        ],
      });

      if (typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      database = selectResult;
    } else {
      database = database.toLowerCase();
      if (database !== 'postgresql' && database !== 'mysql') {
        outro(pc.red('Error: Only postgresql or mysql can be selected.'));
        process.exit(1);
      }
    }

    const defaultPort = database === 'postgresql' ? '5432' : '3306';

    if (!port) {
      const portResult = await text({
        message: `Port (Default: ${defaultPort}):`,
        placeholder: defaultPort,
        validate(value) {
          if (value.trim() !== '' && isNaN(Number(value))) {
            return 'Port number must be a number!';
          }
        },
      });

      if (typeof portResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      port = (portResult as string).trim() === '' ? Number(defaultPort) : Number(portResult);
    } else {
      port = Number(port);
      if (isNaN(port)) {
        outro(pc.red('Error: Port must be a valid number.'));
        process.exit(1);
      }
    }

    if (!user) {
      const userResult = await text({
        message: 'User:',
        placeholder: 'root',
        validate(value) {
          if (value.trim().length === 0) return 'Username cannot be empty!';
        },
      });

      if (typeof userResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      user = userResult;
    }

    if (password === undefined) {
      const passResult = await text({
        message: 'Password:',
        placeholder: 'password',
      });

      if (typeof passResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      password = passResult;
    }

    ConfigManager.set({
      db: {
        database: database as 'postgresql' | 'mysql',
        port: Number(port),
        user,
        password,
      },
    });

    outro(pc.green(`Database informations saved! (${ConfigManager.getFilePath()})`));
  });

setCmd.command('folder')
  .option('--path <path>', 'Project target folder path')
  .description('Set project folder structure')
  .action(async (options) => {
    intro(pc.cyan(' mdl config set folder '));

    let folderPath = options.path;
    const rand = Math.ceil(Math.random() * 1000);
    let folderName = options.path ? options.path.split('/').pop() || `unnamed-folder-${rand}` : `unnamed-folder-${rand}`;
    if (!folderPath) {
      const defaultPath = process.cwd();
      const pathResult = await text({
        message: 'Project target folder:',
        placeholder: defaultPath,
      });

      if (typeof pathResult === 'symbol') {
        outro(pc.red('Process canceled.'));
        process.exit(0);
      }
      folderPath = (pathResult as string).trim() === '' ? defaultPath : pathResult;
    }

    ConfigManager.addFolders({
      name: folderName,
      path: folderPath
    });

    outro(pc.green(`🎉 Project target folder successfully saved: ${folderPath} (${ConfigManager.getFilePath()})`));
  })
setCmd
  .command('cwd')
  .description('Set project root directory')
  .option('--path <path>', 'Project root directory path')
  .action(async (options) => {
    intro(pc.cyan(' mdl config set cwd '));

    let projectPath = options.path;

    if (!projectPath) {
      const defaultPath = process.cwd();
      const pathResult = await text({
        message: 'Project root directory:',
        placeholder: defaultPath,
      });

      if (typeof pathResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      projectPath = (pathResult as string).trim() === '' ? defaultPath : pathResult;
    }

    ConfigManager.set({
      cwd: projectPath,
    });

    outro(pc.green(`🎉 Working directory successfully saved: ${projectPath} (${ConfigManager.getFilePath()})`));
  });

const includesCmd = setCmd.command('includes').description('Manage included files/folders');
includesCmd.command('add')
  .argument('<item>', 'File/folder pattern to include')
  .description('Add a pattern to includes')
  .action((item) => {
    ConfigManager.addIncludes(item);
    outro(pc.green(`"${item}" has been added to includes. (${ConfigManager.getFilePath()})`));
  });
includesCmd.command('remove')
  .argument('<item>', 'File/folder pattern to remove')
  .description('Remove a pattern from includes')
  .action((item) => {
    ConfigManager.removeIncludes(item);
    outro(pc.green(`"${item}" has been removed from includes. (${ConfigManager.getFilePath()})`));
  });

const excludesCmd = setCmd.command('excludes').description('Manage excluded files/folders');
excludesCmd.command('add')
  .argument('<item>', 'File/folder pattern to exclude')
  .description('Add a pattern to excludes')
  .action((item) => {
    ConfigManager.addExcludes(item);
    outro(pc.green(`"${item}" has been added to excludes. (${ConfigManager.getFilePath()})`));
  });
excludesCmd.command('remove')
  .argument('<item>', 'File/folder pattern to remove')
  .description('Remove a pattern from excludes')
  .action((item) => {
    ConfigManager.removeExcludes(item);
    outro(pc.green(`"${item}" has been removed from excludes. (${ConfigManager.getFilePath()})`));
  });

configCmd.command('show')
  .description('Show current configuration')
  .action(() => {
    const configData = ConfigManager.get();
    intro(pc.cyan(' Current Configuration '));
    console.log(JSON.stringify(configData, null, 2));
    outro(pc.green(`Configuration path: ${ConfigManager.getFilePath()}`));
  });

const templatesCmd = program
  .command('templates')
  .description('Manage template configurations');

templatesCmd
  .command('add')
  .argument('<templateName>', 'Template name')
  .description('Add a new template based on module blocks')
  .action(async (templateName) => {
    intro(pc.cyan(' mdl templates add '));

    const s = spinner();
    s.start(`Creating template "${templateName}"...`);

    const result = await TemplateManager.add(templateName);

    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Template addition completed!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red('❌ Could not add template.'));
      process.exit(1);
    }
  });

templatesCmd
  .command('list')
  .description('List all available templates')
  .action(() => {
    intro(pc.cyan(' mdl templates list '));

    const list = TemplateManager.list();
    if (list.length === 0) {
      outro(pc.yellow('No templates found.'));
    } else {
      outro(pc.green(`Available Templates:\n${list.map(t => `  - ${t}`).join('\n')}`));
    }
  });

templatesCmd
  .command('remove')
  .description('Remove templates using multi-select')
  .action(async () => {
    intro(pc.cyan(' mdl templates remove '));

    const list = TemplateManager.list();
    if (list.length === 0) {
      outro(pc.yellow('No templates to delete found.'));
      return;
    }

    const selectResult = await multiselect({
      message: 'Select templates you want to delete:',
      options: list.map(t => ({ value: t, label: t })),
      required: false,
    });

    if (isCancel(selectResult) || typeof selectResult === 'symbol') {
      outro(pc.red('Operation canceled.'));
      process.exit(0);
    }

    const selectedTemplates = selectResult as string[];
    if (selectedTemplates.length === 0) {
      outro(pc.yellow('No templates selected for deletion.'));
      return;
    }

    const s = spinner();
    s.start('Deleting selected templates...');
    const result = TemplateManager.remove(selectedTemplates);
    s.stop(`Number of deleted templates: ${result.successCount}`);

    if (result.failed.length > 0) {
      outro(pc.red(`Could not delete templates: ${result.failed.join(', ')}`));
    } else {
      outro(pc.green('🎉 All selected templates deleted successfully!'));
    }
  });

program.action(() => {
  program.outputHelp();
});

program.parse(process.argv);
