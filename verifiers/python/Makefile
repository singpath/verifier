default: build

build:
	docker build -t singpath/verifier2-python:latest .
.PHONY: build

test: build
	docker run -ti -w /app --rm singpath/verifier2-python:latest python3 -m unittest discover -s codeverifier/
.PHONY: test