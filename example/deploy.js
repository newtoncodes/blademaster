'use strict';


module.exports = {
    servers: {
        dev1: {
            host: '',
            port: 22,
            user: 'root',
            key: __dirname + '/../keys/dev1.key'
        },

        dev2: {
            host: '',
            port: 22,
            user: 'root',
            key: __dirname + '/../keys/dev1.key'
        }
    },

    aliases: {
        'd1': ['dev1']
    },

    projects: {
        'notifications-server': {
            local: '/LOCAL/PATH',
            remote: '/REMOTE/PATH',
            chmod: 'Du=rwx,Dgo=rx,Fu=rw,Fgo=r',

            pre: [],
            post: [],

            configs: {
                'config/local.php': '%server%.php'
            },

            servers: {
                dev1: {
                    remote: '/home/test',
                    chmod: 'Du=rwx,Dgo=rx,Fu=rw,Fgo=r',
                    pre: ['ls -l'],
                    post: ['ls -la'],

                    configs: {
                        'config/local.php': 'dev1.php'
                    }
                },

                dev2: {
                    remote: '/home/test',
                    chmod: 'Du=rwx,Dgo=rx,Fu=rw,Fgo=r',
                    pre: [],
                    post: [],

                    configs: {
                        'config/local.php': 'dev2.php'
                    }
                }
            },

            aliases: {
                'd2': ['dev2']
            }
        }
    }
};