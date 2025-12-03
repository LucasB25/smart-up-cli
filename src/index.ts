#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as ncu from 'npm-check-updates';
import semver from 'semver';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';

interface UpdateInfo {
  name: string;
  current: string;
  upgrade: string;
  type: 'major' | 'premajor' | 'minor' | 'patch' | 'other';
  url: string;
}

interface CliOptions {
  dryRun?: boolean;
  backup?: boolean;
}

const program = new Command();

program
  .version('1.3.1')
  .description('A smart and interactive NPM updater')
  .option('-d, --dry-run', 'Simulate the process without writing changes')
  .option('--no-backup', 'Disable automatic package.json backup')
  .action(async (options: CliOptions) => {
    await runSmartUpdate(options);
  });

program.parse(process.argv);

/**
 * Detects the package manager used (npm, yarn, pnpm, bun)
 */
function detectPackageManager() {
  if (fs.existsSync('yarn.lock')) return 'yarn';
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (fs.existsSync('bun.lockb')) return 'bun';
  return 'npm';
}

/**
 * Attempts to find the repository URL for a given package
 */
function getPackageUrl(dep: string): string {
  try {
    const pkgPath = path.join('node_modules', dep, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const url = pkg.homepage || pkg.repository?.url || pkg.repository;

      if (typeof url === 'string') {
        return url.replace(/^git\+/, '').replace(/\.git$/, '');
      }
    }
  } catch (e) {
    // Silent failure, return default npm link
  }
  return `https://www.npmjs.com/package/${dep}`;
}

/**
 * Displays the ASCII banner at startup
 */
function showBanner() {
  console.clear();
  const title = figlet.textSync('Smart-Up', { font: 'Standard' });
  console.log(gradient.pastel.multiline(title));
  console.log(chalk.cyan('   The intelligent interactive updater\n'));
}

/**
 * Creates a backup copy of package.json
 */
function backupPackageJson(): boolean {
  try {
    fs.copyFileSync('package.json', 'package.json.bak');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Restores package.json from the backup
 */
function restoreBackup() {
  try {
    if (fs.existsSync('package.json.bak')) {
      fs.copyFileSync('package.json.bak', 'package.json');
      fs.unlinkSync('package.json.bak');
      console.log(chalk.yellow('\n   ↺ package.json restored from backup.'));
    }
  } catch (e) {
    console.error(chalk.red('\n   ❌ Failed to restore backup.'));
  }
}

/**
 * Main Logic
 */
async function runSmartUpdate(options: CliOptions) {
  showBanner();

  if (!fs.existsSync('package.json')) {
    console.log(boxen(chalk.red('❌ No package.json file found here.'), { padding: 1, borderColor: 'red', borderStyle: 'double' }));
    return;
  }

  const manager = detectPackageManager();

  console.log(boxen(`${chalk.bold('Package Manager:')} ${chalk.magenta(manager)}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: 'gray',
    dimBorder: true
  }));

  const spinner = ora('Analyzing dependencies...').start();

  try {
    const upgradedRaw = await ncu.run({
      packageFile: 'package.json',
      upgrade: false,
      jsonUpgraded: true,
      silent: true,
    }) as Record<string, string>;

    spinner.stop();

    const depNames = Object.keys(upgradedRaw);

    if (depNames.length === 0) {
      console.log(boxen(chalk.green('✅  Everything is up-to-date!\n   Good job maintaining your deps.'), { padding: 1, borderStyle: 'round', borderColor: 'green' }));
      return;
    }

    const pkgContent = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

    const updates: UpdateInfo[] = depNames.map(dep => {
      const currentVersionRaw = pkgContent.dependencies?.[dep] || pkgContent.devDependencies?.[dep] || '0.0.0';
      const newVersionRaw = upgradedRaw[dep];
      const currentSemver = semver.coerce(currentVersionRaw);
      const newSemver = semver.coerce(newVersionRaw);

      let type: UpdateInfo['type'] = 'other';
      if (currentSemver && newSemver) {
        // @ts-ignore - semver types mismatch sometimes
        type = semver.diff(currentSemver.version, newSemver.version) || 'other';
      }

      return {
        name: dep,
        current: currentVersionRaw,
        upgrade: newVersionRaw,
        type,
        url: getPackageUrl(dep)
      };
    });

    const riskOrder = ['patch', 'minor', 'premajor', 'major', 'other'];
    updates.sort((a, b) => riskOrder.indexOf(a.type) - riskOrder.indexOf(b.type));

    const choices = updates.map(update => {
      let badge = '';
      let versionDiff = '';
      let checked = true;

      switch (update.type) {
        case 'major':
          badge = chalk.bgRed.bold.white('  MAJOR  ');
          versionDiff = chalk.red(`${update.current} ➔ ${update.upgrade}`);
          checked = false;
          break;
        case 'premajor':
          badge = chalk.bgRed.bold.white(' PRE-MAJ ');
          versionDiff = chalk.red(`${update.current} ➔ ${update.upgrade}`);
          checked = false;
          break;
        case 'minor':
          badge = chalk.bgYellow.black('  MINOR  ');
          versionDiff = chalk.yellow(`${update.current} ➔ ${update.upgrade}`);
          checked = true;
          break;
        case 'patch':
          badge = chalk.bgGreen.black('  PATCH  ');
          versionDiff = chalk.green(`${update.current} ➔ ${update.upgrade}`);
          checked = true;
          break;
        default:
          badge = chalk.bgGray.white('  OTHER  ');
          versionDiff = chalk.gray(`${update.current} ➔ ${update.upgrade}`);
          checked = false;
      }

      return {
        name: `${chalk.bold(update.name.padEnd(25))} ${badge}  ${versionDiff}\n      ${chalk.dim('└─')} ${chalk.cyan.underline(update.url)}`,
        value: { name: update.name, version: update.upgrade },
        checked: checked,
        short: update.name
      };
    });

    console.log(chalk.gray('Use Space to select, Enter to confirm.\n'));

    const response = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Packages to update:',
        choices: choices,
        pageSize: 15,
        loop: false
      },
    ]);

    if (response.selected.length === 0) {
      console.log(chalk.yellow('\nNo updates selected. Exiting.'));
      return;
    }

    if (options.dryRun) {
      console.log('\n' + boxen(chalk.blue('ℹ️  SIMULATION MODE (DRY RUN)'), { borderStyle: 'round', borderColor: 'blue' }));
      console.log(chalk.dim(`The following packages would have been updated:`));
      response.selected.forEach((s: any) => console.log(` - ${s.name} @ ${s.version}`));
      return;
    }

    if (options.backup !== false) {
      const backupSpinner = ora('Creating backup (package.json.bak)...').start();
      if (backupPackageJson()) {
        backupSpinner.succeed('Backup created.');
      } else {
        backupSpinner.warn('Could not create backup. Continuing...');
      }
    }

    console.log('\n' + boxen(chalk.bold(`Updating ${response.selected.length} packages...`), { padding: { left: 2, right: 2 }, borderStyle: 'classic', borderColor: 'cyan' }) + '\n');

    const writeSpinner = ora('Writing package.json...').start();

    const filter = response.selected.map((s: any) => s.name);

    await ncu.run({
      packageFile: 'package.json',
      upgrade: true,
      filter: filter.join(','),
      silent: true
    });

    writeSpinner.succeed('package.json file updated.');

    console.log(chalk.blue(`\nStarting installation with ${manager}...`));

    try {
      let installCmd = 'npm install';
      if (manager === 'yarn') installCmd = 'yarn';
      if (manager === 'pnpm') installCmd = 'pnpm install';
      if (manager === 'bun') installCmd = 'bun install';

      execSync(installCmd, { stdio: 'inherit' });

      if (options.backup !== false && fs.existsSync('package.json.bak')) {
        fs.unlinkSync('package.json.bak');
      }

      console.log('\n' + boxen(gradient.pastel('  🚀 Updates completed successfully!  \n  Your project is fresh and clean.  '), {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'green'
      }));

    } catch (e) {
      console.log('\n');
      console.error(chalk.bgRed.white(` ❌ Error executing ${manager}. `));

      const { restore } = await inquirer.prompt([{
        type: 'confirm',
        name: 'restore',
        message: 'Installation failed. Do you want to restore the old package.json?',
        default: true
      }]);

      if (restore) {
        restoreBackup();
      } else {
        console.log(chalk.yellow('   Modified package.json kept.'));
      }
    }

  } catch (error: any) {
    if (error.message && (error.message.includes('User force closed') || error.name === 'ExitPromptError')) {
      console.log('\n' + boxen(chalk.yellow('👋 Bye! See you later.'), { padding: 1, borderStyle: 'round', borderColor: 'yellow' }));
      return;
    }

    spinner.stop();
    console.error('\n' + boxen(chalk.red('❌ Critical Error'), { borderStyle: 'double', borderColor: 'red' }));
    console.error(error);
  }
}