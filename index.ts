import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as ncu from 'npm-check-updates';
import semver from 'semver';
import { execSync } from 'child_process';
import fs from 'fs';

const program = new Command();

program
  .version('1.0.1')
  .description('A smart and interactive NPM updater')
  .action(async () => {
    await runSmartUpdate();
  });

program.parse(process.argv);

async function runSmartUpdate() {
  console.log(chalk.bold.blue('\n🚀 Welcome to Smart-Up (Safe Mode)!\n'));

  if (!fs.existsSync('package.json')) {
    console.error(chalk.red('❌ No package.json file found in this directory.'));
    return;
  }

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

      if (!currentSemver || !newSemver) {
        return {
          name: `${chalk.bold(dep)}  [${chalk.gray(currentVersionRaw)} -> ${chalk.magenta(newVersionRaw)}]`,
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
        name: `${chalk.bold(dep)}  [${coloredDiff}]`,
        value: { name: dep, version: newVersionRaw },
        checked: checked,
        short: dep
      };
    });

    const response = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Which dependencies do you want to update?',
        choices: choices,
        pageSize: 15
      },
    ]);

    if (response.selected.length === 0) {
      console.log(chalk.yellow('No updates selected.'));
      return;
    }

    const installSpinner = ora('Updating package.json and installing...').start();

    const filter = response.selected.map((s: any) => s.name);

    await ncu.run({
      packageFile: 'package.json',
      upgrade: true,
      filter: filter.join(','),
      silent: true
    });

    try {
      execSync('npm install', { stdio: 'inherit' });
      installSpinner.succeed(chalk.green('✅ Updates completed successfully!'));
    } catch (e) {
      installSpinner.fail(chalk.red('❌ Error running npm install. Check console output.'));
    }

  } catch (error) {
    spinner.fail('Critical error.');
    console.error(error);
  }
}