# Modulix CLI

<!-- [![npm version](https://img.shields.io/badge/npm-1.0.0-blue.svg)](https://www.npmjs.com/) -->
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

**Modulix** is a modern, lightweight global CLI and programmatic Node.js library designed to dynamically enable, disable, and synchronize feature-based code blocks across your codebase. 

By utilizing special syntax tags inside code comments, Modulix allows you to toggle feature blocks on and off on-demand, clean up inactive feature code, and store clean, block-only templates without cluttering your repository.

---

## Key Features

-  **Dynamic Code Syncing**: Fills or cleans up code between tag markers based on whether the module is enabled or disabled.
-  **Block-Based Templates**: Stores *only* the tagged code blocks inside templates, rather than copying entire files.
-  **Beautiful Interactive CLI**: Built using `@clack/prompts` for premium terminal visuals, spinner animations, and checkbox selectors.
-  **Smart File Filtering**: Supports `includes` and `excludes` rules to filter files during template creation and syncing.
-  **Built-in Backups**: Automatically backs up project files before applying synchronization.

---

## Installation

Install locally in your project:

```bash
npm install --save-dev modulix
```

Or install globally:

```bash
npm install -g modulix
```

This installs both the `modulix` and its shortcut alias `mdl` command.

---

## Tag Syntax

Mark any part of your code with `@<moduleName> <blockName>` and `@!<moduleName> <blockName>` markers.

### Line-based blocks
```javascript
// @auth auth-init
const authService = new AuthService();
setupAuthListeners(authService);
// @!auth auth-init
```

### Inline / Expression-based blocks
```javascript
return 'Login status: ' + /*@auth auth-msg*/ 'Login successful!' /*@!auth auth-msg*/;
```

---

## Quick Start

### 1. Initialize Configuration
Define the project directory you want to work on:
```bash
mdl config set cwd --path /path/to/your/project
```

Add filters for files to scan (e.g. only scan `js` and `ts` files, ignore `node_modules`):
```bash
mdl config set includes add js
mdl config set includes add ts
mdl config set excludes add node_modules
```

Check the active configuration settings at any time:
```bash
mdl config show
```

### 2. Configure Modules
Configure the modules present in your project:
```bash
mdl modules add auth,cargos,billing
```

Enable or disable specific modules:
```bash
mdl modules enable cargos
mdl modules disable billing
```

List all modules in your project. Active modules are printed in **green**, and disabled ones are in **red**:
```bash
mdl modules list
```

### 3. Manage Templates
Save the current state of your code blocks into a reusable template. The CLI scans your files, validates tags, extracts only the blocked content, and stores them:
```bash
mdl templates add my-cargo-template
```

List all saved templates:
```bash
mdl templates list
```

Remove templates using an interactive multi-select interface:
```bash
mdl templates remove
```

### 4. Sync Code
Synchronize your workspace. Choose a template with its creation date from the list. The CLI will automatically fill active module blocks with code from the template and completely clear out inactive module blocks:
```bash
mdl modules sync
```


## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/) to report bugs or request features.

## License

This project is licensed under the [ISC License](LICENSE).
