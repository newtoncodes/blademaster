'use strict';

const exec = require('child_process').exec;
const mkdir = require('mkdirp').sync;
const Fs = require('fs');
const Path = require('path');
const Async = require('async');
const Config = require('./Config');

const Logger = require('serverlog');
const console = new Logger({consoleTime: false});
console.info = new Logger.Stream(console, {style: ['blue'], label: 'INFO', consoleTime: false});
console.success = new Logger.Stream(console, {style: ['green'], label: 'SUCCESS', consoleTime: false});
console.error = new Logger.Stream(console, {style: ['red'], label: 'ERROR', consoleTime: false});


class Deployer {
    constructor(configDir) {
        try {
            this._config = new Config(configDir);
        } catch (e) {
            console.error.log(e.message || e);
        }
    }

    deploy(project, servers, options, callback) {
        let {path, addKey, skipBuild, skipPublish} = options;

        let config;

        try {
            config = this._config.get(project, servers);
        } catch (e) {
            return console.error.log(e.message || e);
        }

        path = Path.resolve(path || config.local).replace(/\\/g, '/');
        let cfg = config['cfg'] || '';

        let dest = Path.resolve(__dirname, '..', 'builds', project).replace(/\\/g, '/');
        let fn = [];

        if (!skipBuild) fn.push(this.build.bind(this, path, dest, cfg));

        if (addKey) fn.push(this.addKey.bind(this, config.servers));
        else if (!skipPublish) fn.push(this.publish.bind(this, dest, config));

        Async.series(fn, callback);
    }

    build(path, dest, cfg, callback) {
        console.info.log('Building ' + path + '...\n');

        run(__dirname, ['npm run builder ' + path + ' ' + dest + ' ' + cfg], (error, output) => {
            if (error) console.error.log('Error during build.');
            else console.success.log('Build ready.');

            if (output.trim().substr(-('SUCCESS!'.length)) === 'SUCCESS!') callback();
            else callback(error || new Error('Unknown error during build.'));
        });
    }

    publish(local, config, callback) {
        local = Path.resolve(local).replace(/\\/g, '/');
        let project = config.name;

        Async.series(config.servers.map(config => callback => {
            let configs = {};

            console.info.log('Publishing ' + config.name + '...');

            try {
                Object.keys(config.configs).forEach(filename => {
                    let dest = Path.join(local, filename);
                    let src = Path.resolve(this._config.path, project, config.configs[filename].replace(/%server%/g, config.name)).replace(/\\/g, '/');

                    if (!Fs.existsSync(src)) throw new Error('Config file missing: ' + src);

                    configs[src] = dest;
                });
            } catch (e) {
                return callback(e);
            }

            console.info.log('Running local pre commands...\n');

            run(local, config.preLocal, error => {
                console.original.log('\n');

                if (error) console.error.log('Error during local pre commands.\n');
                if (error) return callback(error);

                console.success.log('Local pre commands ready.');
                console.info.log('Running remote pre commands...\n');

                remoteRun(config.host, config.port, config.user, config.key, config.remote, config.pre, error => {
                    console.original.log('\n');

                    if (error) console.error.log('Error during remote pre commands.\n');
                    if (error) return callback(error);

                    console.success.log('Remote pre commands ready.');
                    console.info.log('Running rsync...\n');

                    publish(
                        config.host,
                        config.port,
                        config.user,
                        config.key,
                        local,
                        config.remote,
                        config.chmod,
                        config.chown,
                        configs,

                        error => {
                            console.original.log('\n');

                            if (error) console.error.log('Error during rsync.\n');
                            if (error) return callback(error);

                            console.success.log('Rsync ready.');
                            console.info.log('Running remote post commands...\n');

                            remoteRun(config.host, config.port, config.user, config.key, config.remote, config.post, error => {
                                console.original.log('\n');

                                if (error) console.error.log('Error during remote post commands.\n');
                                if (error) return callback(error);

                                console.success.log('Remote post commands ready.');
                                console.info.log('Running local post commands...\n');

                                run(local, config.postLocal, error => {
                                    console.original.log('\n');

                                    if (error) console.error.log('Error during local post commands.\n');
                                    if (error) return callback(error);

                                    console.success.log('Local post commands ready.');
                                    console.success.log('Server ' + config.name + ' deployed successfully.\n');

                                    callback();
                                });
                            });
                        }
                    );
                });
            });

        }), callback);
    }

    addKey(servers, callback) {
        Async.series(servers.map(server => callback => {
            checkKey(
                server.name,
                server.host,
                server.port,
                server.user,
                server.key,

                (error, result) => {
                    if (error) return callback(error);

                    if (!result) addKey(
                        server.name,
                        server.host,
                        server.port,
                        server.user,
                        server.key,
                        callback
                    );

                    else callback();
                }
            );
        }), callback);
    }
}


module.exports = Deployer;


/*
 -u, --update                skip files that are newer on the receiver
 -r, --recursive             recurse into directories
 -l, --links                 copy symlinks as symlinks
 -t, --times                 preserve modification times
 -v, --verbose               increase verbosity
 -e, --rsh=COMMAND           specify the remote shell to use
 --exclude 'dir1'
 */

const bin = Path.resolve(__dirname + '/../bin/tools/').replace(/\\/g, '/');

function remoteRun(host, port, user, key, path, commands, callback) {
    if (!commands || !commands.length) return callback();

    let cmd = commands.join(' && ');

    // let ssh = bin + '\\ssh.exe -p ' + port + ' -o StrictHostKeyChecking=no';
    // if (key) ssh = bin + '\\ssh-agent.exe ' + bin + '\\ssh.exe -p ' + port + ' -i ' + key.replace(/\\/g, '/') + ' -o StrictHostKeyChecking=no';
    let ssh = 'ssh -p ' + port + ' -o StrictHostKeyChecking=no';
    if (key) ssh = 'ssh-agent ssh -p ' + port + ' -i ' + key.replace(/\\/g, '/') + ' -o StrictHostKeyChecking=no';

    cmd = ssh + ' ' + user + '@' + host + ' "cd ' + path + ' && ' + cmd + '"';

    let p = exec(cmd, callback);
    p.stdout.on('data', data => process.stdout.write(data));
    p.stderr.on('data', data => process.stderr.write(data));
}

function publish(host, port, user, key, localPath, remotePath, chmod, chown, configs, callback) {
    Object.keys(configs).forEach(filename => {
        let contents = Fs.readFileSync(filename, 'utf8');
        mkdir(Path.dirname(configs[filename]));
        Fs.writeFileSync(configs[filename], contents, 'utf8');
    });

    port = port || 22;

    // -o PreferredAuthentications=publickey
    // let ssh = bin + '\\ssh.exe -p ' + port + ' -o StrictHostKeyChecking=no';
    // if (key) ssh = bin + '\\ssh-agent.exe ' + bin + '\\ssh.exe -p ' + port + ' -i ' + key.replace(/\\/g, '/') + ' -o StrictHostKeyChecking=no';
    // let cmd = bin + '\\rsync.exe -urltv --delete -e "' + ssh + '" ';

    let ssh = 'ssh -p ' + port + ' -o StrictHostKeyChecking=no';
    if (key) ssh = 'ssh-agent ssh -p ' + port + ' -i ' + key.replace(/\\/g, '/') + ' -o StrictHostKeyChecking=no';
    let cmd = 'rsync -urltv --delete -e "' + ssh + '" ';

    if (chmod) cmd += '--perms --chmod="' + chmod + '" ';
    if (chown) cmd += '--chown="' + chown + '" ';

    process.chdir(localPath);
    console.log('CWD:', process.cwd());

    cmd = cmd + './* ' + user + '@' + host + ':' + remotePath;

    let p = exec(cmd, callback);
    p.stdout.on('data', data => process.stdout.write(data));
    p.stderr.on('data', data => process.stderr.write(data));
}

function addKey(name, host, port, user, key, callback) {
    let p = exec(
        'ssh ' + user + '@' + host + ' -p ' + port + ' mkdir -p .ssh',
        error => {
            if (error) {
                console.log('Error adding key: ' + name + '.');
                return callback(error);
            }

            let p = exec(
                'cat ' + key.replace(/\.key$/, '.pub') + ' | ssh ' + user + '@' + host + ' -p ' + port + ' \'cat >> .ssh/authorized_keys\'',
                error => {
                    if (error) console.log('Error adding key: ' + name + '.');
                    else console.log('Added key: ' + name + '.');

                    callback(error);
                }
            );
        }
    );

    p.stdout.on('data', data => process.stdout.write(data));
    p.stderr.on('data', data => process.stderr.write(data));
}

function checkKey(name, host, port, user, key, callback) {
    exec(
        //bin + '\\ssh.exe -i ' + key + ' ' + user + '@' + host + ' -p ' + port + ' -o PreferredAuthentications=publickey -o StrictHostKeyChecking=no',
        'ssh -i ' + key + ' ' + user + '@' + host + ' -p ' + port + ' -o PreferredAuthentications=publickey -o StrictHostKeyChecking=no',

        (error, stdout, stderr) => {
            let result;

            if ((stdout + stderr).indexOf('Permission denied (publickey,password)') !== -1) {
                error = null;
                result = false;
            } else result = !error;

            if (error) console.log('Error checking key: ' + name + '.');
            else console.log('Checked key: ' + name + ' - ' + result + '.');

            callback(error, result);
        }
    ).stdout.on('data', data => console.log(data));
}

function run(path, commands, callback) {
    if (!commands || !commands.length) return callback();

    Async.waterfall(commands.map(cmd => (output, callback) => {
        if (!callback) callback = output;

        process.chdir(path);
        console.log('CWD:', process.cwd());

        // cmd = 'cd ' + path.replace(/\\/g, '/') + ' && ' + cmd;
        console.log(cmd);

        let p = exec('bash --login -c "' + cmd.replace(/"/g, /\\"/) + '"', (error, stdout) => {
            output = (output || '') + stdout;
            callback(error, output);
        });
        p.stdout.on('data', data => process.stdout.write(data));
        p.stderr.on('data', data => process.stderr.write(data));
    }), callback);
}