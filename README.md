# Verifier for SingPath.com

[![Build Status](https://travis-ci.org/singpath/verifier.svg?branch=master)](https://travis-ci.org/singpath/verifier)
[![Dependency Status](https://gemnasium.com/singpath/verifier.svg)](https://gemnasium.com/singpath/verifier)

Pull verifier task from a Firebase queue and run them inside container.

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
for verifier needing to run temporally.

The deployment script works without `docker-machine` as well; you can use it
on any server with docker 1.6+ installed and running; you would just skip the
first two steps in the example bellow.


### Requirements

- [python 2.7](https://www.python.org/downloads/);
- [docker](https://docs.docker.com/engine/installation/);
- [docker-machine](https://docs.docker.com/machine/install-machine/);
- `curl` in this example, but you can use any other way to download our
  python deployment script: wget, a browser or clone this repository.

You can install `docker` and `docker-machine` on OS X and Windows using
[Docker Tools](https://www.docker.com/docker-toolbox).


### Using GCE

`docker-machine` has [drivers](https://docs.docker.com/machine/drivers/)
for many VM provider. We will use the Google Cloud Engine in this example.

1. Create a new docker host on Google Cloud platform:
    ```shell
    export PROJECT_ID="your-google-project-id"
    docker-machine create --driver google \
      --google-project $PROJECT_ID \
      --google-zone us-central1-a \
      --google-machine-type f1-micro \
      remote-docker
    ```

    To create a Virtualbox machine instead:
    ```
    docker-machine create --driver virtualbox remote-docker
    ```

2. In all your terminals, set your docker client to use this docker machine:
    ```shell
    eval "$(docker-machine env remote-docker)"
    ```

3. Download the verifier client:
    ```shell
    curl -O https://raw.githubusercontent.com/singpath/verifier/master/deployment/verifier-machine.py
    chmod +x verifier-machine.py
    ```

4. Pull the verifier images:
    ```shell
    ./verifier-machine pull latest
    ```

5. Setup a verifier profile:
    ```shell
    ./verifier-machine init some-profile-name
    ```
    it saves a verifier settings in `./.singpath-verifiers.json` as a profile.
    `./.singpath-verifiers.json` can hold settings for verifier targeting
    different Firebase db, queue or machine.

6. Start the verifier:
    ```shell
    ./verifier-machine start \
        --profile-id some-profile-name \
        --interactive
    ```
    You would remove `--interactive` argument to let the container run in daemon
    mode and `./verifier-machine stop --profile-id some-profile-name` to stop
    it.
