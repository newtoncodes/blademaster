'use strict';

const Fs = require('fs');
const Path = require('path');


class Config {
    constructor(path) {
        this.path = Path.resolve(path);

        if (!Fs.existsSync(this.path)) {
            throw new Error('Config directory not found: ' + this.path);
        }

        if (!Fs.existsSync(this.path + '/deploy.js')) {
            throw new Error('deploy.js is missing from the config directory.');
        }

        let config = require(this.path + '/deploy.js');

        this._servers = config.servers;
        this._aliases = config.aliases;
        this._projects = {};

        if (!this._aliases['all']) this._aliases['all'] = Object.keys(this._servers);

        Object.keys(config.projects).forEach(key => this._projects[key] = this._parseProject(key, config.projects[key]));

        console.log(this);
    }

    _parseProject(name, config) {
        let project = Object.assign({}, config);

        delete project.servers;
        delete project.aliases;
        delete project.configs;
        delete project.local;

        let cfg = config.cfg;
        let local = config.local;
        let servers = {};
        let aliases = Object.assign({}, this._aliases, config.aliases);

        Object.keys(config.servers).forEach(key => {
            if (!this._servers[key]) {
                throw new Error('There is no server ' + key + ' for project ' + name + '.');
            }

            let server = Object.assign({}, this._servers[key], project, config.servers[key]);
            server.configs = Object.assign({}, config.configs, server.configs || {});
            server.name = key;

            Object.keys(server.configs).forEach(c => server.configs[c] = server.configs[c].replace(/%server%/gi, key));

            servers[key] = server;
        });

        return {
            name,
            aliases,
            servers,
            local,
            cfg
        };
    }

    get(project, servers) {
        if (!this._projects[project]) {
            throw new Error('Project not found: ' + project);
        }

        project = this._projects[project];

        let all = [];

        servers.forEach(name => {
            if (!project.servers[name] && !project.aliases[name]) {
                throw new Error('There is no server ' + name + ' for project ' + project.name + '.');
            }

            if (project.aliases[name]) all = all.concat(project.aliases[name]);
            else if (project.servers[name]) all.push(name);
        });

        all = all.reduce(function(p, c) {
            if (p.indexOf(c) < 0) p.push(c);
            return p;
        }, []);

        let a = {
            name: project.name,
            local: project.local,
            cfg: project.cfg,

            servers: all.map(name => {
                if (!project.servers[name]) {
                    throw new Error('There is no server ' + name + ' for project ' + project.name + '.');
                }

                return project.servers[name];
            })
        };

        console.dir(a, {depth: 10});

        return a;
    }
}


module.exports = Config;