# Contributing

The verifier docker image is automatically build by docker hub when
master get a new commit or merge a new pull request.

## Development

### Requirements

- a Firebase DB and its Auth secret;
- docker;
- [git](https://git-scm.com/);
- nodejs 4; you can use [nvm](https://github.com/creationix/nvm) to manage
  multiple versions of node.
- bash;
- make;

OS X includes git, make and bash. The git package for windows should include
bash and make.

On OS X and Windows, you should install
[Docker Tools](https://www.docker.com/docker-toolbox); it will include
docker, docker-machine and VirtualBox.

To create new docker machine if you have:
```shell
docker-machine create -d virtualbox default
```

Then start the docker machine:
```shell
docker-machine start default
eval $(docker-machine env default)
```

In every terminal, configure docker the use that machine:
```shell
eval $(docker-machine env default)
```

### Development

Clone the repository and install node dependencies:
```shell
git clone https://github.com/ChrisBoesch/singpath-verifiers.git
cd singpath-verifiers.git
npm install
```

To run the queue worker:
```shell
./bin/verifier build-verifiers
./bin/verifier run  \
    -e https://some-firebase-id.firebaseio.com/singpath/queues/default \
    --promtp-secret
```

    Note:

    You can save the secret and endpoint in a .singpathrc json file. Run
    `./bin/verifier -h` for more information.


To push task to the queue:
```shell
./bin/verifier push \
    -e https://some-firebase-id.firebaseio.com/singpath/queues/default \
    --promtp-secret \
    '---
language: python,
tests: |
  >>> foo
  1
solution: |
  foo = 1
'```


    Note:

    You could push the content of a file with
    `./bin/verifier push "$(cat solutions.yaml)"`.


### Running the daemon in a container


The verifier daemon can run inside a container. The host docker socket just
need be shared with the verifier daemon container.

A verifier will need read/write access to the socket and the Firebase secret.
By default, the socket group is "docker" and assuming the docker group ID is
100, to run verifier daemon watching the default queue, you would start the
verifier container with this command:

```shell
docker build -t singpath/verifier2:latest .
docker run -ti --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --group-add 100 \
    -e SINGPATH_FIREBASE_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
    -e SINGPATH_FIREBASE_ENDPOINT="https://singpath-play.firebaseio.com/singpath/queues/default" \
    singpath/verifier2:latest
```

Running the verifier in a docker machine saves installing node on the server.


#### Group ID

To find the host docker group ID:

0. on OS X or windows, connect to the docker host: `docker-machine ssh default`.
1. check the group assigned to `/var/run/docker.sock`: `ls -l /var/run/docker.sock.
2. find the group id in `/etc/group`: cat /etc/group

On the docker-machine hosts using VirtualBox, the group id should be "100".


## TODO

- add support for Firebase Auth token directly instead of a Firebase secret.
- publish rules for the DB.