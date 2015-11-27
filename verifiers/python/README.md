# Python3 Verifier for SingPath.com

Runs some python code and test it with some doctest tests.

## Usage

To download the the docker image and run the solutions and its tests.

```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-python:latest \
	verify '---
tests: |
  foo=1
solution: |
  >>> foo
  1
'
```

You can provide the solution/tests payload as JSON or YAML. If in YAML, the
YAML document must start with "---".

To pass the content of a file:
```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-python:latest \
	verify "$(< examples/pass.yaml)"
```

To build the verifier instead of downloading it:
```shell
git clone https://github.com/ChrisBoesch/singpath-verifiers.git
cd singpath-verifiers/python
make
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-python:latest \
  verify '---
tests: |
  foo=1
solution: |
  >>> foo
  1
'
```