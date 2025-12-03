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

const program = new Command();

program
  .version('1.2.0')
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
    // Ignore
  }
  return `https://www.npmjs.com/package/${dep}`;
}

function showBanner() {
  console.clear();
  const title = figlet.textSync('Smart-Up', { font: 'Standard' });
  console.log(gradient.pastel.multiline(title));
  console.log(chalk.cyan('   The intelligent interactive updater\n'));
}

async function runSmartUpdate() {
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
    const upgraded = await ncu.run({
      packageFile: 'package.json',
      upgrade: false,
      jsonUpgraded: true,
      silent: true,
    }) as Record<string, string>;

    spinner.stop();

    const dependencies = Object.keys(upgraded);

    if (dependencies.length === 0) {
      console.log(boxen(chalk.green('✅  Everything is up-to-date!\n   Good job maintaining your deps.'), { padding: 1, borderStyle: 'round', borderColor: 'green' }));
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
          name: `${chalk.bold(dep)}\n      ${chalk.dim('Unknown version type')}`,
          value: { name: dep, version: newVersionRaw },
          checked: false,
          short: dep
        };
      }

      const diffType = semver.diff(currentSemver.version, newSemver.version);

      let badge = '';
      let versionDiff = '';
      let checked = true;

      switch (diffType) {
        case 'major':
          badge = chalk.bgRed.bold.white('  MAJOR  ');
          versionDiff = chalk.red(`${currentSemver.version} ➔ ${newSemver.version}`);
          checked = false;
          break;
        case 'premajor':
          badge = chalk.bgRed.bold.white(' PRE-MAJ ');
          versionDiff = chalk.red(`${currentSemver.version} ➔ ${newSemver.version}`);
          checked = false;
          break;
        case 'minor':
          badge = chalk.bgYellow.black('  MINOR  ');
          versionDiff = chalk.yellow(`${currentSemver.version} ➔ ${newSemver.version}`);
          checked = true;
          break;
        case 'patch':
          badge = chalk.bgGreen.black('  PATCH  ');
          versionDiff = chalk.green(`${currentSemver.version} ➔ ${newSemver.version}`);
          checked = true;
          break;
        default:
          badge = chalk.bgGray.white(' OTHER ');
          versionDiff = chalk.gray(`${currentSemver.version} ➔ ${newSemver.version}`);
      }

      return {
        name: `${chalk.bold(dep.padEnd(20))} ${badge}  ${versionDiff}\n      ${chalk.dim('└─')} ${chalk.cyan.underline(url)}`,
        value: { name: dep, version: newVersionRaw },
        checked: checked,
        short: dep
      };
    });

    console.log(chalk.gray('Use Space to select/deselect, Enter to confirm.\n'));

    const response = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Ready to update? Select packages:',
        choices: choices,
        pageSize: 15,
        loop: false
      },
    ]);

    if (response.selected.length === 0) {
      console.log(chalk.yellow('\nNo updates selected. Exiting.'));
      return;
    }

    console.log('\n' + boxen(chalk.bold(`Updating ${response.selected.length} packages...`), { padding: { left: 2, right: 2 }, borderStyle: 'classic', borderColor: 'cyan' }) + '\n');

    const installSpinner = ora('Writing package.json...').start();

    const filter = response.selected.map((s: any) => s.name);

    await ncu.run({
      packageFile: 'package.json',
      upgrade: true,
      filter: filter.join(','),
      silent: true
    });

    installSpinner.text = `Installing with ${manager}...`;

    try {
      let installCmd = 'npm install';
      if (manager === 'yarn') installCmd = 'yarn';
      if (manager === 'pnpm') installCmd = 'pnpm install';
      if (manager === 'bun') installCmd = 'bun install';

      execSync(installCmd, { stdio: 'inherit' });

      installSpinner.stop();
      console.log('\n' + boxen(gradient.pastel('  🚀 Updates completed successfully!  \n  Your project is now fresh and clean.  '), {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'green'
      }));

    } catch (e) {
      installSpinner.fail(chalk.red(`❌ Error running ${manager}. Check console output.`));
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