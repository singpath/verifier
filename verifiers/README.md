# Language verifier

A language verifier image should have a command named "verify" in the path taking
a json encoded "solution" and "tests" payload as argument and return to `stdout`
the json encode result object. It must have a boolean "solved" field; typically
something like this:

```json
{"results": [{"call": "x", "expected": 2, "received": "2", "correct": true},
             {"call": "y", "expected": 3, "received": "2", "correct": false}],
"printed": "",
"solved": false,}
```

These results from verifying code are usually used to build a table to provide
feedback to users:

```
| Called | Expected | Recieved  | Correct |
| ------ |:--------:| :--------:|:--------|
| x      | 2        | 2         | True    |
| y      | 3        | 2         | False   |
```

It can also log debug info to `stderr`. The `stderr` stream will be piped to
the verifier daemon `stderr`.


## Example

A new verifier, that we would name `dummy`, would have a `Dockerfile` and
a `verify` files in a `verifier/verifiers/dummy` directory:

```Dockefile
FROM python:3.4-slim

RUN mkdir -p /app && adduser --system verifier

ENV PATH="$PATH:/app"
COPY verify /app/
RUN chmod +x /app/verify

```

```python
#!/usr/bin/env python3

import sys
import json

print(sys.argv, file=sys.stderr)
json.dump({
    "solved": False,
    "errors": "Not implemented.",
}, fp=sys.stdout)

```

And you would build the container image with:
```shell
cd ./dummy
docker build -t singpath/verifier2-dummy:latest .
```

You would also need to add the image to `verifier/images.json`:
```json
{
    "java": {
        "name": "singpath/verifier2-java",
        "path": "./verifiers/java"
    },
    "javascript": {
        "name": "singpath/verifier2-javascript",
        "path": "./verifiers/javascript"
    },
    "python": {
        "name": "singpath/verifier2-python",
        "path": "./verifiers/python"
    },
    "dummy": {
        "name": "singpath/verifier2-dummy",
        "path": "./verifiers/dummy"
    }
}

```

Try it with:
```shell
docker run -ti --rm singpath/verifier2-dummy:latest verify '{
	"tests": "",
	"solution": "print(\"TODO\")"
}'
```

or:
```shell
./bin/verifier test dummy '{
	"tests": "",
	"solution": "print(\"TODO\")"
}'
```
