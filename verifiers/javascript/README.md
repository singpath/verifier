# Javascript Verifier for SingPath.com

Runs some javascript code and test it using a simple testing framework and
nodejs [assert](https://nodejs.org/api/assert.html).


## Usage

To download the the docker image and run the solutions and its tests.

```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-javascript:latest \
	verify '{
		"tests": "foo=1",
		"solution": "test('test1', () => assert.equal(1, foo))"
	}'
```

You can provide the solution/tests payload as JSON or YAML. If in YAML, the
YAML document must start with "---".

To pass the content of a file:
```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-javascript:latest \
	verify "$(cat examples/pass.json)"
```

To build the verifier instead of downloading it:
```shell
git clone https://github.com/ChrisBoesch/singpath-verifiers.git
cd singpath-verifiers/javascript
make
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-javascript:latest \
	verify "$(cat examples/pass.json)
```