# Modulix CLI

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

**Modulix** is a modern, lightweight global CLI and programmatic Node.js library designed to dynamically enable, disable, and synchronize feature-based code blocks across both codebase files and databases (MySQL / PostgreSQL).

By using tag markers in your comments, Modulix allows you to toggle feature blocks on and off on-demand, clean up inactive feature code, swap codebase backups, and compile database schemas seamlessly.

---

## Language & Database Compatibility

Modulix provides stable parsing, block synchronization, and execution for the following environments:

| Technology | Extension / Tool | Comment Style | Status |
| :--- | :--- | :--- | :--- |
| **JavaScript** | `.js`, `.mjs`, `.cjs` | `// @module block` or `/* @module block */` | **Stable** |
| **TypeScript** | `.ts`, `.tsx` | `// @module block` or `/* @module block */` | **Stable** |
| **PHP** | `.php` | `// @module block`, `/* @module block */`, or `# @module block` | **Stable** |
| **HTML** | `.html`, `.htm` | `<!-- @module block -->` | **Stable** |
| **CSS** | `.css`, `.scss`, `.less` | `/* @module block */` | **Stable** |
| **Go** | `.go` | `// @module block` or `/* @module block */` | **Stable** |
| **C#** | `.cs` | `// @module block` or `/* @module block */` | **Stable** |
| **SQL** | `.sql` | `-- @module block` or `/* @module block */` | **Stable** |
| **MySQL** | `mysqldump` & `mysql` | `-- @module block` | **Stable** (With custom binary paths) |
| **PostgreSQL** | `pg_dump` & `psql` | `-- @module block` | **Stable** (With custom binary paths) |

---

## Installation

Install globally:
```bash
npm install -g modulix
```

This registers the global `modulix` CLI and its shortcut alias `mdl`.

---

## Initialization

Before using Modulix in a project, initialize a local configuration in the root directory:
```bash
mdl init
```
This creates a local `.modulix` directory with a default `config.json` inside your project. The CLI will automatically use this local configuration when executed from within this directory, keeping different project settings completely isolated.

---

## Tag Syntax

Mark any part of your code with `@<moduleName> <blockName>` and `@!<moduleName> <blockName>` markers in comments.

### 1. Code Block Comments (JS/TS/PHP/C#/Go)
```javascript
// @auth users-table
const authService = new AuthService();
setupAuthListeners(authService);
// @!auth users-table
```

### 2. Inline / Expression Comments
```javascript
return 'Status: ' + /*@auth auth-msg*/ 'Logged In!' /*@!auth auth-msg*/;
```

### 3. HTML Comments
```html
<!-- @billing invoice-panel -->
<div class="billing-container">
  <h3>Invoices</h3>
</div>
<!-- @!billing invoice-panel -->
```

### 4. SQL / Database Comments
```sql
-- @auth users-schema
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50)
);
-- @!auth users-schema
```

### 5. File-Level Module Tagging
If you write `@@<moduleName> <blockName>` on the very first line of a file, the entire file will be treated as a block of that module. If the module is disabled, the file is automatically deleted; once re-enabled and synced, it will be restored.
```php
// @@auth auth-full-page
<?php
// Entire file belongs to "auth" module.
?>
// @@!auth auth-full-page
```

---

## CLI Command Reference (Logical Order)

### 0. Project Initialization (`init`)
Initializes a local configuration folder `.modulix` and a default `config.json` file in the current directory.
```bash
mdl init
```

### 1. Configuration Settings (`config`)
Used to configure target directories, file extension filters, and database connection details.

* **Show Config**: Shows the active workspace configurations.
  ```bash
  mdl config show
  ```
* **Set Target Workspace Path (`cwd`)**: Sets the root folder to scan.
  ```bash
  mdl config set cwd --path /path/to/your/project
  ```
* **Include Extensions**: Restricts scanning to specific file extensions.
  ```bash
  mdl config set includes add .php
  mdl config set includes add .html
  ```
* **Exclude Folders**: Ignores specific folders (e.g. dependencies, vendor directories).
  ```bash
  mdl config set excludes add node_modules
  ```
* **Monorepo / Multi-Folder Sync (`folder`)**: Configures multiple subdirectories.
  ```bash
  mdl config set folder --path ./client
  mdl config set folder --path ./server
  ```
* **Set Database Connections (`db`)**: Configures MySQL or PostgreSQL. Includes interactive wizard prompting for credentials and optional custom executable paths.
  ```bash
  mdl config set db
  ```

---

### 2. Module Settings (`modules`)
Allows declaring modules, listing statuses, and toggling features.

* **Add Modules**: Declare new module names.
  ```bash
  mdl modules add
  ```
* **Remove Modules**: Delete module declarations.
  ```bash
  mdl modules remove billing
  ```
* **List Modules**: Lists all modules and statuses (green if active, red if disabled).
  ```bash
  mdl modules list
  ```
* **Enable Module**: Activate a module.
  ```bash
  mdl modules enable auth
  ```
* **Disable Module**: Deactivate a module.
  ```bash
  mdl modules disable auth
  ```
* **Reset Modules**: Clear all module declarations.
  ```bash
  mdl modules clear
  ```

---

### 3. Templates Management (`templates`)
Saves code block templates before stripping them out of the source codebase during sync.

* **Add Template**: Saves the current state of all tagged code blocks into a template.
  ```bash
  mdl templates add base-template
  ```
* **List Templates**: Lists all saved templates with creation dates.
  ```bash
  mdl templates list
  ```
* **Remove Template**: Interactive prompt to delete templates.
  ```bash
  mdl templates remove
  ```

---

### 4. Workspace Synchronization (`sync`)
Synchronizes your workspace files based on the active modules list and selected template.

* **Sync Codebase**: Scans files, clears blocks of disabled modules, and populates active blocks from the template.
  ```bash
  mdl modules sync
  ```
  *(If no template is specified, it opens an interactive selector list)*

---

### 5. Codebase Backups (`backup`)
Manages filesystem snapshots of your folders before applying sync operations.

* **Create Backup**: Manual codebase backup.
  ```bash
  mdl backup create initial-state
  ```
* **List Backups**: Lists backups with creation dates and directory sizes.
  ```bash
  mdl backup list
  ```
* **Status**: Lists structural differences (created, modified, deleted files) between a backup and the workspace.
  ```bash
  mdl backup status initial-state
  ```
* **Swap (Restore)**: Restores workspace files back to a backup state.
  ```bash
  mdl backup swap initial-state
  ```
* **Remove**: Deletes codebase backups.
  ```bash
  mdl backup remove initial-state
  ```

---

### 6. Database Operations (`db`)
Performs schema synchronization, backups, and restores for databases.

* **Sync Database**: Compiles the template SQL schema (e.g. `schema.sql`), filters it based on active modules, drops the active schema, and imports the filtered structure.
  ```bash
  mdl db sync base-template
  ```
  *(If the template is missing a schema file, it prompts you to type a custom path)*
* **Create DB Backup**: Dumps live database structure + data.
  ```bash
  mdl db backup create v1-db-backup
  ```
* **List DB Backups**: Lists SQL database backups.
  ```bash
  mdl db backup list
  ```
* **Swap DB (Restore)**: Drops database tables and restores schema + data from the SQL backup file.
  ```bash
  mdl db backup swap v1-db-backup
  ```
* **Remove DB Backups**: Deletes database backup files.
  ```bash
  mdl db backup remove v1-db-backup
  ```

---

## Example Scenario Walkthrough

Let's walk through managing an **Authentication (`auth`)** module on a web project containing PHP, HTML, CSS, and MySQL.

### Step 1: Write code with Modulix tags

#### 1. In `index.php` (PHP Logic & HTML)
```php
<?php
// @auth auth-logic
include 'auth.php';
// @!auth auth-logic
?>
<!DOCTYPE html>
<html>
<head>
  <style>
    /* @auth auth-style */
    .login-btn { background-color: #4CAF50; color: white; }
    /* @!auth auth-style */
  </style>
</head>
<body>
  <!-- @auth auth-button -->
  <button class="login-btn">Log In</button>
  <!-- @!auth auth-button -->
</body>
</html>
```

#### 2. In `auth.php` (Entire file belongs to `auth`)
```php
// @@auth full-page
<?php
class AuthService {
  public function login() { /* ... */ }
}
// @@!auth full-page
```

#### 3. In `schema.sql` (MySQL Schema template)
```sql
-- @auth auth-schema
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);
-- @!auth auth-schema
```

---

### Step 2: Initialize & Configure Workspace
Initialize a local Modulix configuration and set target settings:
```bash
mdl init
mdl config set cwd --path .
mdl config set includes add .php
mdl config set includes add .html
mdl config set includes add .css
mdl config set includes add .sql

mdl config set db
```

---

### Step 3: Register and Save Template
Add the `auth` module and save the base code block templates:
```bash
mdl modules add auth
mdl templates add v1-template
```
*(Modulix extracts all code inside `@auth ... @!auth` and saves them in `.modulix/templates/v1-template`)*

---

### Step 4: Toggle & Sync (Disabling the Auth Module)
Let's disable the authentication module and synchronize the workspace:
```bash
mdl modules disable auth
mdl modules sync v1-template
```
#### Result:
* **`index.php`** is cleaned up:
  ```php
  <?php
  // @auth auth-logic
  // @!auth auth-logic
  ?>
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      /* @auth auth-style */
      /* @!auth auth-style */
    </style>
  </head>
  <body>
    <!-- @auth auth-button -->
    <!-- @!auth auth-button -->
  </body>
  </html>
  ```
* **`auth.php`** is automatically deleted (since the module is disabled and it has `@@auth full-page` at the top and `@@!auth full-page` at the bottom.).
* Now, sync the database:
  ```bash
  mdl db sync v1-template
  ```
  *(Modulix compiles the `schema.sql` template, removes the `users` table creation script, and recreates the MySQL database clean without the `users` table!)*

---

### Step 5: Restoring (Re-enabling the Auth Module)
To bring the feature back to both the codebase and the database:
```bash
mdl modules enable auth
mdl modules sync v1-template
mdl db sync v1-template
```
#### Result:
* The code block inside `index.php` is restored from the template.
* `auth.php` is recreated and restored.
* The `users` table is recreated inside the MySQL database!

---

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/arifaydin16/modulix/issues) to report bugs or request features.

## License

This project is licensed under the [ISC License](LICENSE).
