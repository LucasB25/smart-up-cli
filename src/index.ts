import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as ncu from 'npm-check-updates';
import semver from 'semver';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .version('1.1.2')
  .description('A smart and interactive NPM updater')
  .action(async () => {
    await runSmartUpdate();
  });

program.parse(process.argv);

function detectPackageManager() {
  if (fs.existsSync('yarn.lock')) return 'yarn';
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (fs.existsSync('bun.lockb')) return 'bun';
  return 'npm';
}

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
    // Ignore errors and fallback to npmjs URL
  }
  return `https://www.npmjs.com/package/${dep}`;
}

async function runSmartUpdate() {
  console.log(chalk.bold.blue('\n🚀 Welcome to Smart-Up!\n'));

  if (!fs.existsSync('package.json')) {
    console.error(chalk.red('❌ No package.json file found in this directory.'));
    return;
  }

  const manager = detectPackageManager();
  console.log(chalk.dim(`ℹ️  Detected package manager: ${chalk.bold(manager)}`));

  const spinner = ora('Analyzing dependencies...').start();

  try {
    const upgraded = await ncu.run({
      packageFile: 'package.json',
      upgrade: false,
      jsonUpgraded: true,
      silent: true,
    }) as Record<string, string>;

    spinner.stop();

    const dependencies = Object.keys(upgraded);

    if (dependencies.length === 0) {
      console.log(chalk.green('✅ Everything is up-to-date! Good job.'));
      return;
    }

    const choices = dependencies.map((dep) => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      const currentVersionRaw = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep] || '0.0.0';
      const newVersionRaw = upgraded[dep];

      const currentSemver = semver.coerce(currentVersionRaw);
      const newSemver = semver.coerce(newVersionRaw);
      const url = getPackageUrl(dep);

      if (!currentSemver || !newSemver) {
        return {
          name: `${chalk.bold(dep)} ${chalk.dim(`(${url})`)}\n    [${chalk.gray(currentVersionRaw)} -> ${chalk.magenta(newVersionRaw)}]`,
          value: { name: dep, version: newVersionRaw },
          checked: false,
          short: dep
        };
      }

      const diffType = semver.diff(currentSemver.version, newSemver.version);

      let coloredDiff = '';
      let checked = true;

      switch (diffType) {
        case 'major':
          coloredDiff = chalk.red(`Major: ${currentSemver.version} -> ${newSemver.version}`);
          checked = false;
          break;
        case 'premajor':
          coloredDiff = chalk.red(`Pre-Major: ${currentSemver.version} -> ${newSemver.version}`);
          checked = false;
          break;
        case 'minor':
          coloredDiff = chalk.yellow(`Minor: ${currentSemver.version} -> ${newSemver.version}`);
          checked = true;
          break;
        case 'patch':
          coloredDiff = chalk.green(`Patch: ${currentSemver.version} -> ${newSemver.version}`);
          checked = true;
          break;
        default:
          coloredDiff = chalk.gray(`${currentSemver.version} -> ${newSemver.version}`);
      }

      return {
        name: `${chalk.bold(dep)} ${chalk.cyan.underline(url)}\n    [${coloredDiff}]`,
        value: { name: dep, version: newVersionRaw },
        checked: checked,
        short: dep
      };
    });

    console.log(chalk.dim('Tip: Cmd+Click (Mac) or Ctrl+Click (Win) on links to see changelogs.\n'));

    const response = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Select dependencies to update:',
        choices: choices,
        pageSize: 15,
        loop: false
      },
    ]);

    if (response.selected.length === 0) {
      console.log(chalk.yellow('No updates selected.'));
      return;
    }

    const installSpinner = ora('Updating package.json...').start();

    const filter = response.selected.map((s: any) => s.name);

    await ncu.run({
      packageFile: 'package.json',
      upgrade: true,
      filter: filter.join(','),
      silent: true
    });

    installSpinner.text = `Installing dependencies with ${manager}...`;

    try {
      let installCmd = 'npm install';
      if (manager === 'yarn') installCmd = 'yarn';
      if (manager === 'pnpm') installCmd = 'pnpm install';
      if (manager === 'bun') installCmd = 'bun install';

      execSync(installCmd, { stdio: 'inherit' });

      installSpinner.succeed(chalk.green(`✅ Updates completed successfully using ${manager}!`));
    } catch (e) {
      installSpinner.fail(chalk.red(`❌ Error running ${manager}. Check console output.`));
    }

  } catch (error) {
    spinner.fail('Critical error.');
    console.error(error);
  }
}