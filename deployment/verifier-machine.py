#!/usr/bin/env python2.7
#
# The MIT License (MIT)

# Copyright (c) 2015 ChrisBoesch

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#

from __future__ import print_function

import argparse
import getpass
import json
import logging
import os
import subprocess
import sys


DOCKER_GID_KEY = 'dockerGroupId'
MACHINE_ID_KEY = 'machineId'
FB_ID_KEY = 'firebaseID'
FB_QUEUE_KEY = 'firebaseQueueName'
FB_SECRET_KEY = 'firebaseSecret'

DEFAULT_SETTINGS = {
    FB_ID_KEY: 'singpath-play',
    FB_QUEUE_KEY: 'default',
    FB_SECRET_KEY: None,
    MACHINE_ID_KEY: 'default',
    DOCKER_GID_KEY: None,
}

SOCKET_PATH = '/var/run/docker.sock'
SSH_CMD = ("""
export DOCKER_GROUP_NAME=`ls -l %s | awk '{ print $4 }'`;
cat /etc/group | grep "^$DOCKER_GROUP_NAME" | cut -d: -f3
""" % SOCKET_PATH).replace('\n', ' ').strip()


def main():
    settings = Settings()
    args = settings.parse_args()
    if args.profile_id:
        settings.load(args.profile_id)
        args = settings.parse_args()

    logging.basicConfig(
        format='%(asctime)s - %(message)s', level=args.level
    )
    args.func(args)


class Settings(object):

    def __init__(self):
        self.profiles = {}
        self.profile_id = None

    def load(self, profile_id, path='./.singpath-verifiers.json'):
        self.profile_id = profile_id
        try:
            logging.info('Loading existing settings...')
            with open(path) as fp:
                self.profiles = json.load(fp)
        except Exception:
            logging.debug('%s was not found.' % path)

    @classmethod
    def save(cls, profile_id, settings, path='./.singpath-verifiers.json'):
        settings = cls()
        settings.load(profile_id)
        settings.profiles[profile_id] = settings
        try:
            logging.info('Saving profile "%s"...', profile_id)
            with open(path, 'w') as fp:
                json.dump(
                    settings.profiles,
                    fp=fp,
                    sort_keys=True,
                    indent=4,
                    separators=(',', ': ')
                )
        except Exception as e:
            logging.error('Failed to save "%s": %s.' % path, e)

    def _settings(self):
        if self.profile_id is None:
            return {}
        else:
            return self.profiles.get(self.profile_id, {})

    def parse_args(self, args=None):
        parser = self.parser()
        settings = self._settings()
        parser.set_defaults(
            profile_id=self.profile_id,
            firebase_id=settings.get(
                FB_ID_KEY, DEFAULT_SETTINGS[FB_ID_KEY]
            ),
            firebase_queue=settings.get(
                FB_QUEUE_KEY, DEFAULT_SETTINGS[FB_QUEUE_KEY]
            ),
            firebase_auth_secret=settings.get(
                FB_SECRET_KEY, DEFAULT_SETTINGS[FB_SECRET_KEY]
            ),
            docker_gid=settings.get(
                DOCKER_GID_KEY, DEFAULT_SETTINGS[DOCKER_GID_KEY]
            ),
        )
        return parser.parse_args(args)

    @classmethod
    def parser(cls):
        parser = argparse.ArgumentParser(
            description=(
                'Manage the verifier daemon container. '
                'Assumes the docker server will run locally '
                'or that docker-machine will manage your remote docker '
                'machine (like a OS X / Windows virtualbox VM or a production '
                'server on AWS, GCE, Digital Ocean, etc...).'
            )
        )
        parser.add_argument(
            '-s', '--quiet',
            action='store_const', dest='level', const=logging.WARNING
        )
        parser.add_argument(
            '-v', '--verbose',
            action='store_const', dest='level', const=logging.DEBUG
        )
        parser.set_defaults(level=logging.INFO)

        subparsers = parser.add_subparsers()
        cls.pull_parser(subparsers)
        cls.init_parser(subparsers)
        cls.start_parser(subparsers)
        cls.stop_parser(subparsers)
        cls.push_parser(subparsers)

        parser.set_defaults(
            firebase_id=DEFAULT_SETTINGS[FB_ID_KEY],
            firebase_queue=DEFAULT_SETTINGS[FB_QUEUE_KEY],
            firebase_auth_secret=DEFAULT_SETTINGS[FB_SECRET_KEY],
            docker_gid=DEFAULT_SETTINGS[DOCKER_GID_KEY],
        )

        return parser

    @staticmethod
    def pull_parser(subparsers):
        parser = subparsers.add_parser(
            'pull',
            help='pull the verifier daemon docker image',
            description=(
                'Pull the verifier daemon docker from docker hub'
            ),
        )

        parser.add_argument('tag')
        parser.set_defaults(tag='latest')
        parser.set_defaults(func=pull)

    @staticmethod
    def init_parser(subparsers):
        parser = subparsers.add_parser(
            'init',
            help='configure verifier',
            description=(
                'Saves sets of verifier configuration in '
                './.singpath-verifiers.json.'
            ),
        )
        parser.add_argument('profile-id')
        parser.add_argument('-m', '--machine-id')
        parser.add_argument('-f', '--firebase-id')
        parser.add_argument('-q', '--firebase-queue')
        parser.add_argument('-S', '--firebase-auth-secret')
        parser.add_argument('-g', '--docker-gid')
        parser.set_defaults(func=init)

    @staticmethod
    def start_parser(subparsers):
        parser = subparsers.add_parser(
            'start',
            help='start verifier',
            description=(
                'Start the verifier - '
                'docker should already be set to use the correct machine '
                '(see `docker-machine env` on OS X / Windows).'
            ),
        )
        parser.add_argument('-p', '--profile-id')
        parser.add_argument('-f', '--firebase-id')
        parser.add_argument('-q', '--firebase-queue')
        parser.add_argument('-S', '--firebase-auth-secret')
        parser.add_argument('-g', '--docker-gid')
        parser.add_argument('-i', '--interactive', action='store_true')
        parser.set_defaults(func=start)

    @staticmethod
    def stop_parser(subparsers):
        parser = subparsers.add_parser(
            'stop',
            help='stop verifier',
            description=(
                'Stop the verifier - '
                'docker should already be set to use the correct machine '
                '(see `docker-machine env` on OS X / Windows).'
            ),
        )
        parser.add_argument('-p', '--profile-id')
        parser.set_defaults(func=stop)

    @staticmethod
    def push_parser(subparsers):
        parser = subparsers.add_parser(
            'push',
            help='push task(s)',
            description=('Push task(s) to the queue a marchine targetting'),
        )
        parser.add_argument('-p', '--profile-id')
        parser.add_argument('-f', '--firebase-id')
        parser.add_argument('-q', '--firebase-queue')
        parser.add_argument('-S', '--firebase-auth-secret')
        parser.add_argument(
            'payload',
            help='Payload(s), json or yaml encoded, to send the queue'
        )
        parser.set_defaults(func=push)


def pull(opts):
    image = 'singpath/verifier2:%s' % opts.tag
    cmd = ['docker', 'pull', image]

    logging.info('Pulling the verifier daemon docker image (%s)', image)
    docker = subprocess.Popen(cmd)
    return docker.wait()


def init(opts):
    settings = ask_settings(opts)
    set_socket_id(settings, opts)

    Settings.save(opts.profile_id, settings)


def start(opts):
    if opts.docker_gid is None:
        logging.error('Docker socket group id is missing.')
        exit(128)

    if opts.firebase_auth_secret is None:
        logging.error('Firebase secret is missing.')
        exit(129)

    queue_url = "https://%s.firebaseio.com/singpath/queues/%s" % (
        opts.firebase_id,
        opts.firebase_queue,
    )

    if opts.profile_id:
        container_name = 'verifier-%s' % opts.profile_id
    else:
        container_name = 'verifier-%s-%s' % (
            opts.firebase_id, opts.firebase_queue
        )

    cmd = [
        'docker', 'run', '--rm', '--name', container_name,
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        '--group-add', str(opts.docker_gid),
        '-e', 'SINGPATH_FIREBASE_SECRET=%s' % opts.firebase_auth_secret,
        '-e', 'SINGPATH_FIREBASE_QUEUE=%s' % queue_url,
        '-e', 'SKIP_BUILD=0',
        'singpath/verifier2', '/app/bin/verifier'
    ]

    if opts.debug:
        cmd.push('-d')

    cmd.push('run')

    if not opts.interactive:
        cmd.remove('--rm')
        cmd.insert(2, '-d')
        logging.info(
            'Starting verifier container in daemon mode as %s...',
            container_name
        )
        docker = subprocess.Popen(cmd)
        return docker.wait()

    try:
        logging.info('Starting verifier container as %s...', container_name)
        docker = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr,
            stdin=subprocess.PIPE,
        )
        return docker.wait()
    except KeyboardInterrupt:
        logging.info('Stopping container %s...', container_name)
        docker.terminate()
        subprocess.Popen(['docker', 'kill', container_name]).wait()


def stop(opts):
    if not opts.profile_id:
        logging.error(
            'The profile id is missing (I cannot guess the container name). '
            'Stop the container using `docker ps` and `docker rm`.'
        )
        exit(128)

    container_name = 'verifier-%s' % opts.profile_id
    cmd = ['docker', 'rm', 'f', container_name]
    logging.info(
        'Stopping verifier container (named "%s")...',
        container_name
    )
    docker = subprocess.Popen(cmd)
    return docker.wait()


def push(opts):
    if opts.firebase_auth_secret is None:
        logging.error('Firebase secret is missing.')
        exit(129)

    queue_url = "https://%s.firebaseio.com/singpath/queues/%s" % (
        opts.firebase_id,
        opts.firebase_queue,
    )

    if opts.profile_id:
        container_name = 'pusher-%s' % opts.profile_id
    else:
        container_name = 'pusher-%s-%s' % (
            opts.firebase_id,
            opts.firebase_queue,
        )

    cmd = [
        'docker', 'run', '--rm', '--name', container_name,
        '-e', 'SINGPATH_FIREBASE_SECRET=%s' % opts.firebase_auth_secret,
        '-e', 'SINGPATH_FIREBASE_QUEUE=%s' % queue_url,
        '-e', 'SKIP_BUILD=0',
        'singpath/verifier2', '/app/bin/verifier', 'push', opts.payload
    ]

    try:
        logging.info('Starting pusher container as %s...', container_name)
        docker = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr,
            stdin=subprocess.PIPE,
        )
        return docker.wait()
    except KeyboardInterrupt:
        logging.info('Stopping container %s...', container_name)
        docker.terminate()
        subprocess.Popen(['docker', 'kill', container_name]).wait()


def prompt(msg, default):
    result = raw_input('%s [%s]: ' % (msg, default,))
    result = result if result else default
    logging.info('%s : %s', msg.strip(), result)
    return result


def prompt_secret(firebase_id, opts):
    error(
        '\nYour firebase secret is available at '
        'https://%s.firebaseio.com/?page=Admin' % firebase_id
    )
    secret = getpass.getpass(
        prompt='\nFirebase secret (leave empty to keep previous): ',
        stream=sys.stderr
    )
    return secret if secret else opts.firebase_auth_secret


def ask_settings(opts):
    settings = {}

    settings[MACHINE_ID_KEY] = prompt('\nMachine ID', opts.machine_id)
    settings[FB_ID_KEY] = prompt('\nFirebase ID', opts.firebase_id)
    settings[FB_QUEUE_KEY] = prompt('\nFirebase ID', opts.firebase_queue)
    settings[FB_SECRET_KEY] = prompt_secret(settings[FB_ID_KEY], opts)

    return settings


def set_socket_id(settings, opts):
    logging.info('Guessing machine\'s docker socket group id...')

    gid = opts.docker_gid
    if gid is None:
        gid = local_socket_gid()

    if gid is None:
        gid = remote_socket_gid(settings.get(MACHINE_ID_KEY))

    if gid is None:
        logging.warning(
            'Failed to guess the docker socket group id.\n'
            'Find out which group id the verifier needs to gain access '
            'to the docker socket and assign it to "%s" in '
            './.singpath-verifiers.json' % DOCKER_GID_KEY
        )
    else:
        settings[DOCKER_GID_KEY] = gid
        logging.info('Docker group id is %s', gid)


def remote_socket_gid(machine_id):
    if machine_id is None:
        return

    docker_machine = which('docker-machine')
    if docker_machine is None:
        logging.debug('No docker-machine.')
        return

    ssh = subprocess.Popen(
        [docker_machine, 'ssh', machine_id, SSH_CMD],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    stdout, stderr = (s.strip() for s in ssh.communicate())
    if ssh.returncode != 0:
        logging.debug(
            'Failed to find remote docker socket group id: %s', stderr
        )
        return

    return int(stdout)


def local_socket_gid():
    try:
        return os.stat(SOCKET_PATH).st_gid
    except Exception:
        logging.debug('No local docker socket.')
        return None


def is_exe(fpath):
    return os.path.isfile(fpath) and os.access(fpath, os.X_OK)


def which(program):
    """
    Python implementation of which

    see http://stackoverflow.com/questions/377017
    """
    for path in os.environ["PATH"].split(os.pathsep):
        path = path.strip('"')
        exe_file = os.path.join(path, program)
        if is_exe(exe_file):
            return exe_file
    return None


def error(*args):
    print(*args, **{'file': sys.stderr})


if __name__ == '__main__':
    main()
