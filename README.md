# Verifier for SingPath.com

[![Build Status](https://travis-ci.org/singpath/verifier.svg?branch=master)](https://travis-ci.org/singpath/verifier)
[![Dependency Status](https://gemnasium.com/singpath/verifier.svg)](https://gemnasium.com/singpath/verifier)

Pull verifier task from a Firebase queue and run them inside a docker container.

It consists of a daemon watching for task added to
`https://some-firebase-id.firebaseio.com/singpath/queues/default/tasks`,
and of docker verifier images, one for each language supported.

A task will be run in a one-time-use container; the results will be written
to `https://some-firebase-id.firebaseio.com/singpath/queuedSolutions/pathId/levelId/problemId/user-public-id/default/results/taskId`.


## Development

- [verifier daemon](./CONTRIBUTING.md);
- [verifiers images](./verifiers/README.md)


## Deployment with `docker-machine`



`docker-machine` configure docker on a remote server which might include
creating a new VM, booting it up and installing docker, and allows you to manage
their containers remotely with your local docker client.

Using `docker-machine` is a simple way to boot up a docker host and is
the recommended way to run Docker on OS X and Windows via VirtualBox driver.
But doesn't allow to easily share the control of the machine. It's best suited
for a verifier needing to run temporally.

The `verifier-machine.py` deployment script works without `docker-machine`;
you can use it on any server with docker 1.7+ installed and running; you
would just skip the docker host setup.


### Requirements

- [python 2.7](https://www.python.org/downloads/);
- [docker](https://docs.docker.com/engine/installation/);
- [docker-machine](https://docs.docker.com/machine/install-machine/);
- `curl` in this example, but you can use any other way to download our
  [python deployment script](https://github.com/singpath/verifier/blob/master/deployment/verifier-machine.py):
  wget, a browser or clone this repository.

You can install `docker` and `docker-machine` on OS X and Windows using
[Docker Tools](https://www.docker.com/docker-toolbox).


### Setup a docker host with `docker-machine`

`docker-machine` has [drivers](https://docs.docker.com/machine/drivers/)
for many VM provider. We will use the Virtualbox driver to run it on your
local machine in this example.

1. Let setup a name for this machine:
    ```
    export DOCKER_MACHINE_NAME=default
    ```

2. Create a new docker host on a local virtualbox machine:
    ```
    docker-machine create --driver virtualbox $DOCKER_MACHINE_NAME
    ```

    If you wanted to setup a machine on Google Compute Engine instead
    just use the "google" driver:
    ```shell
    export PROJECT_ID="your-google-project-id"
    docker-machine create --driver google \
      --google-project $PROJECT_ID \
      --google-zone us-central1-a \
      --google-machine-type f1-micro \
      $DOCKER_MACHINE_NAME
    ```

3. Set your docker client to use this docker machine :
    ```shell
    eval "$(docker-machine env $DOCKER_MACHINE_NAME)"
    ```

At this point, you could run the verifier daemon with:
```
docker pull singpath/verifier2:latest
docker run -d --name verifier-remote-docker \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add 100 \
  -e SINGPATH_FIREBASE_SECRET=xxxxxxx \
  -e SINGPATH_FIREBASE_QUEUE=https://singpath-play.firebaseio.com/singpath/queues/default \
  -e SINGPATH_MAX_WORKER=1 \
  -e SINGPATH_IMAGE_TAG=latest \
  singpath/verifier2
```

It is a long command line, guessing how to give the container access
to the docker daemon might be dificult and it leaves the firebase secret
in your terminal history.

You could instead:
- run the [nodejs daemon directly](https://github.com/singpath/verifier/blob/master/CONTRIBUTING.md)
  (you would still need to give some firebase settings to the program);
- or use
  [verifier-machine.py](https://github.com/singpath/verifier/blob/master/deployment/verifier-machine.py)
  to store those settings and start the daemon (see below).


### Setup `verifier-machine.py` script


0. Make sure docker is properly setup in that terminal:
  ```shell
  eval "$(docker-machine env $DOCKER_MACHINE_NAME)"
  ```

1. Download the `verifier-machine.py` script:
    ```shell
    curl -O https://raw.githubusercontent.com/singpath/verifier/master/deployment/verifier-machine.py
    chmod +x verifier-machine.py
    ```

2. Pull the verifier images:
    ```shell
    ./verifier-machine.py pull -t latest
    ```

3. Setup a verifier profile:
    ```shell
    ./verifier-machine.py init --machine-id=$DOCKER_MACHINE_NAME some-profile-name
    ```
    it saves a verifier settings in `./.singpath-verifiers.json` as a profile.
    `./.singpath-verifiers.json` can hold settings for verifier targeting
    different Firebase db, queue or machine.

    Note that it only needs the machine name to guess how to give the daemon
    access to docker. It won't be used by the `start` subcommand.

### Start the verifier with `verifier-machine.py`

```shell
./verifier-machine.py start \
  --profile-id some-profile-name \
  --interactive
```

Note the verifier daemon need to build the verifiers for each language before
starting properly. It will take a few minutes the first time it runs.

Press `ctrl+c` to stop the verifier.

You would remove `--interactive` argument to let the container run in daemon
mode and `./verifier-machine stop --profile-id some-profile-name` to stop
it:

```shell
./verifier-machine.py start \
  --profile-id some-profile-name
./verifier-machine.py stop \
  --profile-id some-profile-name
```
