examples ?= `cat examples/stdout.yaml`

default: build

build:
	docker build -t singpath/verifier2-java:latest .
.PHONY: build

bash: build
	docker run -ti --rm \
		-e CLASSPATH="/app/lib/*:/app/build/dist:/app/build/tests" \
		singpath/verifier2-java:latest bash

test: build
	docker run -ti --rm \
		-e CLASSPATH="/app/lib/*:/app/build/dist:/app/build/tests" \
		singpath/verifier2-java:latest \
		java org.junit.runner.JUnitCore com.singpath.TestSuite

example: build
	docker run -ti --rm \
		--net="none" \
		--cap-drop=ALL \
		singpath/verifier2-java:latest \
		verify "$(examples)"