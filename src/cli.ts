import { Command } from 'commander';
import { intro, outro, spinner, text, select, isCancel, cancel, multiselect } from '@clack/prompts';
import pc from 'picocolors';
import { ConfigManager, TemplateManager, BackupManager, ModuleManager, DatabaseManager, formatDate, formatSize } from './index.js';
import process from 'node:process';
import path from 'node:path';
import { existsSync } from 'node:fs';


const program = new Command();

program
  .name('modulix')
  .description('A global CLI tool for modularization')
  .version('1.0.0');

const configCmd = program
  .command('config')
  .description('Manage configuration settings');
const backupCmd = program
  .command('backup')
  .description('Manage backup configurations');
const modulesCmd = program
  .command('modules')
  .description('Manage module configurations');
const dbCmd = program
  .command('db')
  .description('Manage database backups, templates and synchronization');

const setCmd = configCmd
  .command('set')
  .description('Set a configuration parameter');

backupCmd.command('list')
  .description('List all backups with details')
  .action(() => {
    intro(pc.cyan(' modulix backup list '));
    const list = BackupManager.list();
    if (list.length === 0) {
      outro(pc.yellow('No backups found.'));
    } else {
      const listStr = list.map(b => {
        return `  - ${pc.bold(b.name)} (Date: ${formatDate(b.birthtime)}, Size: ${formatSize(b.size)})`;
      }).join('\n');
      outro(pc.green(`Available Backups:\n${listStr}`));
    }
  });

backupCmd.command('create')
  .argument('[name]', 'Backup name')
  .description('Create a new backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix backup create '));
    const s = spinner();
    s.start('Creating backup...');
    const result = await BackupManager.create(name);
    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Backup created successfully!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red('❌ Could not create backup.'));
      process.exit(1);
    }
  });

backupCmd.command('remove')
  .argument('[name]', 'Backup name')
  .description('Remove a backup or select from list to remove')
  .action(async (name) => {
    intro(pc.cyan(' modulix backup remove '));

    if (name) {
      const s = spinner();
      s.start(`Removing backup "${name}"...`);
      const result = await BackupManager.remove([name]);
      if (result.successCount > 0) {
        s.stop(pc.green(`Backup "${name}" removed successfully.`));
        outro(pc.green('🎉 Backup removed.'));
      } else {
        s.stop(pc.red(`Failed to remove backup "${name}". It might not exist.`));
        outro(pc.red('❌ Could not remove backup.'));
        process.exit(1);
      }
    } else {
      const list = BackupManager.list();
      if (list.length === 0) {
        outro(pc.yellow('No backups found to remove.'));
        return;
      }

      const selectResult = await multiselect({
        message: 'Select backups you want to delete:',
        options: list.map(b => ({
          value: b.name,
          label: `${b.name} (${formatDate(b.birthtime)} - ${formatSize(b.size)})`
        })),
        required: false,
      });

      if (isCancel(selectResult) || typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }

      const selectedBackups = selectResult as string[];
      if (selectedBackups.length === 0) {
        outro(pc.yellow('No backups selected for deletion.'));
        return;
      }

      const s = spinner();
      s.start('Deleting selected backups...');
      const result = await BackupManager.remove(selectedBackups);
      s.stop(`Number of deleted backups: ${result.successCount}`);

      if (result.failed.length > 0) {
        outro(pc.red(`Could not delete backups: ${result.failed.join(', ')}`));
      } else {
        outro(pc.green('🎉 All selected backups deleted successfully!'));
      }
    }
  });

backupCmd.command('status')
  .argument('[name]', 'Backup name')
  .description('Compare project files with the selected backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix backup status '));

    let backupName = name;
    if (!backupName) {
      const list = BackupManager.list();
      if (list.length === 0) {
        outro(pc.yellow('No backups found.'));
        return;
      }

      const selectResult = await select({
        message: 'Select a backup to compare:',
        options: list.map(b => ({
          value: b.name,
          label: `${b.name} (${formatDate(b.birthtime)} - ${formatSize(b.size)})`
        }))
      });

      if (isCancel(selectResult) || typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      backupName = selectResult as string;
    }

    const s = spinner();
    s.start(`Comparing project files with backup "${backupName}"...`);
    const result = await BackupManager.status(backupName);
    if (!result.success) {
      s.stop(pc.red(result.message));
      outro(pc.red('❌ Could not compare backup.'));
      process.exit(1);
    }

    s.stop(`Comparison complete!`);

    for (const f of result.files) {
      let statusStr = '';
      if (f.status === 'backed_up') {
        statusStr = pc.green('(backed up)');
      } else if (f.status === 'diff') {
        statusStr = pc.yellow('(diff)');
      } else if (f.status === 'no_backup') {
        statusStr = pc.red('(no backup)');
      }
      console.log(`  ${f.relativePath} ${statusStr}`);
    }

    outro(pc.green('🎉 Backup status comparison completed.'));
  });

backupCmd.command('swap')
  .argument('[name]', 'Backup name')
  .description('Delete all project files and restore from the selected backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix backup swap '));

    let backupName = name;
    if (!backupName) {
      const list = BackupManager.list();
      if (list.length === 0) {
        outro(pc.yellow('No backups found.'));
        return;
      }

      const selectResult = await select({
        message: 'Select a backup to restore/swap to:',
        options: list.map(b => ({
          value: b.name,
          label: `${b.name} (${formatDate(b.birthtime)} - ${formatSize(b.size)})`
        }))
      });

      if (isCancel(selectResult) || typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      backupName = selectResult as string;
    } else {
      const backupsDir = BackupManager.getBackupsDir();
      const targetDir = path.join(backupsDir, backupName);
      if (!existsSync(targetDir)) {
        outro(pc.red(`Error: Backup with name "${backupName}" does not exist.`));
        process.exit(1);
      }
    }

    const confirmInput = await text({
      message: `Please type "confirm" to delete project files and restore from "${backupName}":`,
      validate(value) {
        if (value.trim() !== 'confirm') {
          return 'You must type "confirm" to proceed!';
        }
      }
    });

    if (isCancel(confirmInput) || typeof confirmInput === 'symbol') {
      outro(pc.red('Operation canceled.'));
      process.exit(0);
    }

    const s = spinner();
    s.start(`Swapping project files with backup "${backupName}"...`);
    const result = await BackupManager.swap(backupName);
    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Backup swap completed successfully!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red('❌ Could not swap backup.'));
      process.exit(1);
    }
  });

modulesCmd.command('clear')
  .description('Clear all configured modules')
  .action(() => {
    ModuleManager.clear();
    outro(pc.green(`All modules have been cleared from configuration. (${ConfigManager.getFilePath()})`));
  });

modulesCmd.command('remove')
  .description('Remove specific modules from the configuration')
  .action(async () => {
    const list = ModuleManager.list();
    if (list.length === 0) {
      outro(pc.yellow('No modules configured.'));
      return;
    }

    const selectResult = await multiselect({
      message: 'Select modules to remove:',
      options: list.map(module => ({ value: module.name, label: module.name })),
      required: false,
    });

    if (isCancel(selectResult) || typeof selectResult === 'symbol') {
      cancel('Operation canceled by the user.');
      process.exit(0);
    }

    const selectedModules = selectResult as string[];
    if (selectedModules.length === 0) {
      outro(pc.yellow('No modules selected for removal.'));
      return;
    }

    ModuleManager.remove(selectedModules);
    outro(pc.green(`Modules removed from configuration: ${selectedModules.join(', ')} (${ConfigManager.getFilePath()})`));
  });

modulesCmd.command('list')
  .description('List all configured modules')
  .action(() => {
    const list = ModuleManager.list();
    if (list.length === 0) {
      outro(pc.yellow('No modules configured.'));
    } else {
      const listStr = list.map(m => {
        if (m.active) {
          return pc.green(`${m.name} (active)`);
        } else {
          return pc.red(`${m.name} (disabled)`);
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

    ModuleManager.add(moduleNames);
    outro(pc.green(`Modules successfully added to configuration: ${moduleNames.join(', ')} (${ConfigManager.getFilePath()})`));
  });

modulesCmd.command('enable')
  .argument('<module>', 'Module name')
  .description('Enable a module')
  .action((moduleName) => {
    ModuleManager.enable(moduleName);
    outro(pc.green(`Module "${moduleName}" has been enabled.`));
  });

modulesCmd.command('disable')
  .argument('<module>', 'Module name')
  .description('Disable a module')
  .action((moduleName) => {
    ModuleManager.disable(moduleName);
    outro(pc.green(`Module "${moduleName}" has been disabled.`));
  });

modulesCmd.command('sync')
  .argument('[templateName]', 'Template name')
  .description('Synchronize module folders')
  .action(async (templateName) => {
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


    let selectedTemplateName = templateName;
    if (!selectedTemplateName) {
      const selectedTemplateNameResult = await select({
        message: 'Select a template:',
        options: templates.map(t => ({
          value: t.name,
          label: `${t.name} (Created At: ${formatDate(t.birthtime)})`
        }))
      });

      if (isCancel(selectedTemplateNameResult) || typeof selectedTemplateNameResult === 'symbol') {
        cancel('Operation canceled.');
        process.exit(0);
      }
      selectedTemplateName = selectedTemplateNameResult as string;
    } else {
      const templatesList = TemplateManager.list();
      if (!templatesList.includes(selectedTemplateName)) {
        outro(pc.red(`Error: Template "${selectedTemplateName}" not found.`));
        process.exit(1);
      }
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

    const result = await ModuleManager.sync(selectedTemplateName, backupName);
    if (!result.success) {
      s.stop(`Error: ${result.message}`);
      outro(pc.red('❌ Synchronization could not be completed.'));
      process.exit(1);
    }

    const reports = result.reports;
    if (reports.length === 0) {
      s.stop('Synchronization complete! No changes made.');
    } else {
      s.stop(`Synchronization complete! ${reports.length} files processed.`);
      console.log('\nSync Details:');
      for (const r of reports) {
        let fileStatusStr = '';
        if (r.status === 'created') {
          fileStatusStr = pc.green('(created)');
        } else if (r.status === 'deleted') {
          fileStatusStr = pc.red('(deleted)');
        } else if (r.status === 'diff') {
          fileStatusStr = pc.yellow('(diff)');
        }

        console.log(`  ${r.relativePath} ${fileStatusStr}`);

        if (r.status === 'diff' && r.blockChanges && r.blockChanges.length > 0) {
          for (const bc of r.blockChanges) {
            let blockStatusStr = '';
            if (bc.status === 'created') {
              blockStatusStr = pc.green('(created)');
            } else if (bc.status === 'deleted') {
              blockStatusStr = pc.red('(deleted)');
            } else if (bc.status === 'diff') {
              blockStatusStr = pc.yellow('(diff)');
            }
            console.log(`    - ${bc.tag} ${blockStatusStr}`);
          }
        }
      }
      console.log(''); // empty line
    }

    outro(pc.green('🎉 Synchronization completed successfully.'));
  });

setCmd
  .command('db')
  .description('Set database connection settings')
  .option('-d, --database <type>', 'Database selection (postgresql, mysql)')
  .option('--host <host>', 'Database host')
  .option('-n, --name <name>', 'Database name')
  .option('-p, --port <number>', 'Port number')
  .option('-u, --user <username>', 'User name')
  .option('-pass, --password <password>', 'Password')
  .option('--mysqldump-path <path>', 'Path to mysqldump executable')
  .option('--mysql-path <path>', 'Path to mysql executable')
  .option('--pg-dump-path <path>', 'Path to pg_dump executable')
  .option('--psql-path <path>', 'Path to psql executable')
  .action(async (options) => {
    intro(pc.cyan(' mdl config set db '));

    let database = options.database;
    let host = options.host;
    let dbName = options.name;
    let port = options.port;
    let user = options.user;
    let password = options.password;
    let mysqldumpPath = options.mysqldumpPath;
    let mysqlPath = options.mysqlPath;
    let pgDumpPath = options.pgDumpPath;
    let psqlPath = options.psqlPath;

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

    if (!host) {
      const hostResult = await text({
        message: 'Host (Default: localhost):',
        placeholder: 'localhost',
      });

      if (typeof hostResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      host = ((hostResult || '') as string).trim() === '' ? 'localhost' : hostResult;
    }

    if (!dbName) {
      const nameResult = await text({
        message: 'Database Name:',
        validate(value) {
          if (value.trim().length === 0) return 'Database name cannot be empty!';
        },
      });

      if (typeof nameResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      dbName = nameResult;
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
      port = ((portResult || '').toString() == '' || !portResult) ? Number(defaultPort) : Number(portResult);
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

    if (database === 'mysql') {
      if (!mysqldumpPath) {
        const dumpPathResult = await text({
          message: 'Mysqldump Path (Optional, leave blank to use default):',
          placeholder: 'mysqldump',
        });

        if (typeof dumpPathResult === 'symbol') {
          outro(pc.red('Operation canceled.'));
          process.exit(0);
        }
        mysqldumpPath = dumpPathResult.trim() === '' ? undefined : dumpPathResult;
      }

      if (!mysqlPath) {
        const sqlPathResult = await text({
          message: 'Mysql Path (Optional, leave blank to use default):',
          placeholder: 'mysql',
        });

        if (typeof sqlPathResult === 'symbol') {
          outro(pc.red('Operation canceled.'));
          process.exit(0);
        }
        mysqlPath = sqlPathResult.trim() === '' ? undefined : sqlPathResult;
      }
    } else if (database === 'postgresql') {
      if (!pgDumpPath) {
        const dumpPathResult = await text({
          message: 'Pg_dump Path (Optional, leave blank to use default):',
          placeholder: 'pg_dump',
        });

        if (typeof dumpPathResult === 'symbol') {
          outro(pc.red('Operation canceled.'));
          process.exit(0);
        }
        pgDumpPath = dumpPathResult.trim() === '' ? undefined : dumpPathResult;
      }

      if (!psqlPath) {
        const psqlPathResult = await text({
          message: 'Psql Path (Optional, leave blank to use default):',
          placeholder: 'psql',
        });

        if (typeof psqlPathResult === 'symbol') {
          outro(pc.red('Operation canceled.'));
          process.exit(0);
        }
        psqlPath = psqlPathResult.trim() === '' ? undefined : psqlPathResult;
      }
    }

    const dbConfig: any = {
      provider: database as 'postgresql' | 'mysql',
      host,
      database: dbName,
      port: Number(port),
      user,
      password,
    };

    if (mysqldumpPath) dbConfig.mysqldumpPath = mysqldumpPath;
    if (mysqlPath) dbConfig.mysqlPath = mysqlPath;
    if (pgDumpPath) dbConfig.pgDumpPath = pgDumpPath;
    if (psqlPath) dbConfig.psqlPath = psqlPath;

    ConfigManager.set({ db: dbConfig });

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

program
  .command('init')
  .description('Initialize local configuration in the current directory')
  .action(() => {
    intro(pc.cyan(' mdl init '));
    const result = ConfigManager.initLocal();
    if (result.success) {
      outro(pc.green(`🎉 ${result.message}`));
    } else {
      outro(pc.red(`❌ ${result.message}`));
    }
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

const dbBackupCmd = dbCmd
  .command('backup')
  .description('Manage database backups');

dbBackupCmd.command('create')
  .argument('[name]', 'Backup name')
  .description('Create a new database backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix db backup create '));
    const s = spinner();
    s.start('Creating database backup...');
    const result = await DatabaseManager.createBackup(name);
    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Database backup created successfully!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red(`❌ Could not create database backup: ${result.message}`));
      process.exit(1);
    }
  });

dbBackupCmd.command('list')
  .description('List all database backups')
  .action(() => {
    intro(pc.cyan(' modulix db backup list '));
    const list = DatabaseManager.listBackups();
    if (list.length === 0) {
      outro(pc.yellow('No database backups found.'));
    } else {
      const listStr = list.map(b => {
        return `  - ${pc.bold(b.name)} (Date: ${formatDate(b.birthtime)}, Size: ${formatSize(b.size)})`;
      }).join('\n');
      outro(pc.green(`Available Database Backups:\n${listStr}`));
    }
  });

dbBackupCmd.command('remove')
  .argument('[name]', 'Backup name')
  .description('Remove a database backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix db backup remove '));

    if (name) {
      const s = spinner();
      s.start(`Removing database backup "${name}"...`);
      const result = await DatabaseManager.removeBackups([name]);
      if (result.successCount > 0) {
        s.stop(pc.green(`Database backup "${name}" removed successfully.`));
        outro(pc.green('🎉 Database backup removed.'));
      } else {
        s.stop(pc.red(`Failed to remove database backup "${name}".`));
        outro(pc.red('❌ Could not remove database backup.'));
        process.exit(1);
      }
    } else {
      const list = DatabaseManager.listBackups();
      if (list.length === 0) {
        outro(pc.yellow('No database backups found to remove.'));
        return;
      }

      const selectResult = await multiselect({
        message: 'Select database backups you want to delete:',
        options: list.map(b => ({
          value: b.name,
          label: `${b.name} (${formatDate(b.birthtime)} - ${formatSize(b.size)})`
        })),
        required: false,
      });

      if (isCancel(selectResult) || typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }

      const selectedBackups = selectResult as string[];
      if (selectedBackups.length === 0) {
        outro(pc.yellow('No database backups selected for deletion.'));
        return;
      }

      const s = spinner();
      s.start('Deleting selected database backups...');
      const result = await DatabaseManager.removeBackups(selectedBackups);
      s.stop(`Deleted ${result.successCount} database backups.`);
      if (result.failed.length > 0) {
        outro(pc.red(`Could not delete: ${result.failed.join(', ')}`));
      } else {
        outro(pc.green('🎉 All selected database backups deleted successfully!'));
      }
    }
  });

dbBackupCmd.command('swap')
  .argument('[name]', 'Backup name')
  .description('Restore database schema + data from backup')
  .action(async (name) => {
    intro(pc.cyan(' modulix db backup swap '));

    let backupName = name;
    if (!backupName) {
      const list = DatabaseManager.listBackups();
      if (list.length === 0) {
        outro(pc.yellow('No database backups found.'));
        return;
      }

      const selectResult = await select({
        message: 'Select a database backup to restore/swap to:',
        options: list.map(b => ({
          value: b.name,
          label: `${b.name} (${formatDate(b.birthtime)} - ${formatSize(b.size)})`
        }))
      });

      if (isCancel(selectResult) || typeof selectResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      backupName = selectResult as string;
    }

    const confirmInput = await text({
      message: `Please type "confirm" to reset the database and restore from "${backupName}":`,
      validate(value) {
        if (value.trim() !== 'confirm') {
          return 'You must type "confirm" to proceed!';
        }
      }
    });

    if (isCancel(confirmInput) || typeof confirmInput === 'symbol') {
      outro(pc.red('Operation canceled.'));
      process.exit(0);
    }

    const s = spinner();
    s.start(`Swapping database with backup "${backupName}"...`);
    const result = await DatabaseManager.swapBackup(backupName);
    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Database backup swap completed successfully!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red('❌ Could not swap database backup.'));
      process.exit(1);
    }
  });

dbCmd.command('sync')
  .argument('[templateName]', 'Template name')
  .description('Synchronize database schema from template')
  .action(async (templateName) => {
    intro(pc.cyan(' modulix db sync '));

    const config = ConfigManager.get();
    if (!config.db || !config.db.provider || !config.db.database || !config.db.user) {
      outro(pc.red('Error: Please set database connection details first: \nmdl config set db'));
      process.exit(1);
    }

    const templates = TemplateManager.listWithDates();
    if (templates.length === 0) {
      outro(pc.red('Error: No templates found. Please add a template first: \nmdl templates add <templateName>'));
      process.exit(1);
    }

    let selectedTemplateName = templateName;
    if (!selectedTemplateName) {
      const selectedTemplateNameResult = await select({
        message: 'Select a template:',
        options: templates.map(t => ({
          value: t.name,
          label: `${t.name} (Created At: ${formatDate(t.birthtime)})`
        }))
      });

      if (isCancel(selectedTemplateNameResult) || typeof selectedTemplateNameResult === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      selectedTemplateName = selectedTemplateNameResult as string;
    } else {
      const templatesList = TemplateManager.list();
      if (!templatesList.includes(selectedTemplateName)) {
        outro(pc.red(`Error: Template "${selectedTemplateName}" not found.`));
        process.exit(1);
      }
    }

    const templateDir = path.join(TemplateManager.getTemplatesDir(), selectedTemplateName);
    let templateSqlPath = '';
    const possiblePaths = [
      path.join(templateDir, 'db', 'schema.sql'),
      path.join(templateDir, 'schema.sql')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        templateSqlPath = p;
        break;
      }
    }

    let customSchemaPath: string | undefined;
    if (!templateSqlPath) {
      const askPath = await text({
        message: `No database schema file (schema.sql or db/schema.sql) found in template "${selectedTemplateName}". Please enter the path to the schema SQL file:`,
        validate(value) {
          if (value.trim().length === 0) return 'Schema path cannot be empty!';
          const resolved = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
          if (!existsSync(resolved)) {
            return 'File does not exist at this path!';
          }
        }
      });

      if (isCancel(askPath) || typeof askPath === 'symbol') {
        outro(pc.red('Operation canceled.'));
        process.exit(0);
      }
      customSchemaPath = path.isAbsolute(askPath) ? askPath : path.resolve(process.cwd(), askPath);
    }

    const s = spinner();
    s.start('Synchronizing database schema...');
    const result = await DatabaseManager.sync(selectedTemplateName, customSchemaPath);

    if (result.success) {
      s.stop(pc.green(result.message));
      outro(pc.green('🎉 Database schema synchronization completed successfully!'));
    } else {
      s.stop(pc.red(result.message));
      outro(pc.red(`❌ Synchronization failed: ${result.message}`));
      process.exit(1);
    }
  });

program.action(() => {
  program.outputHelp();
});

program.parse(process.argv);
