#!/usr/bin/env node
'use strict';

const fs = require('fs');
const program = require('commander');

const Logger = require('serverlog');
const console = new Logger();
console.info = new Logger.Stream(console, {style: ['blue'], label: 'INFO', consoleTime: false});
console.success = new Logger.Stream(console, {style: ['green'], label: 'SUCCESS', consoleTime: false});
console.error = new Logger.Stream(console, {style: ['red'], label: 'ERROR', consoleTime: false});

const pkg = fs.readFileSync(__dirname + '/../package.json');

program
    .version(JSON.parse(pkg).version)
    .usage('[options] <project> <server ...>')
    .option('--config [dir]', 'Config directory')
    .option('--path [dir]', 'Explicit project path')
    .option('--add-key', 'Add key')
    .option('--skip-build', 'Skip build')
    .option('--skip-publish', 'Skip publish')
    .parse(process.argv);

let configPath = program.config || process.env.DEPLOYER_PATH || null;
let projectPath = program.path || null;
let skipBuild = program.skipBuild || false;
let skipPublish = program.skipPublish || false;
let addKey = program.addKey || false;


if (!configPath) {
    console.error.log('Please provide config directory path.');
    console.error.log('You can set it via --config switch or by setting environment variable DEPLOYER_PATH.');
    process.exit(1);
}

if (!program.args.length) {
    console.error.log('Please provide the project you want to deploy.');
    process.exit(1);
}

let project = program.args.shift();
let servers = program.args;

const Deployer = require('../src/Deployer');

let deployer = new Deployer(configPath);

deployer.deploy(project, servers, {path: projectPath, skipBuild, skipPublish, addKey}, error => {
    if (!error) console.success.log('All done!');
    else {
        console.error.log('Fatal error!\n' + error.message);
        process.exit(1);
    }
});