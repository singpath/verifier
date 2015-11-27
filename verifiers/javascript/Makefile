default: build

build:
	docker build -t singpath/verifier2-javascript:latest .
.PHONY: build

test: build
	docker run -ti --rm singpath/verifier2-javascript:latest npm test
.PHONY: test
