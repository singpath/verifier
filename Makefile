default: build

secret ?= firebase-secret
firebase ?= singpath-play
examples ?= `cat examples/tests.yaml`

build:
	docker build -t singpath/verifier2:latest .
.PHONY: build

run: build
	@docker run -ti --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		--group-add 100 \
		-e SINGPATH_FIREBASE_SECRET="${secret}" \
		-e SINGPATH_FIREBASE_QUEUE="https://${firebase}.firebaseio.com/singpath/queues/my-queue" \
		singpath/verifier2:latest
.PHONY: run

bash: build
	@docker run -ti --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		--group-add 100 \
		-e SINGPATH_FIREBASE_SECRET="${secret}" \
		-e SINGPATH_FIREBASE_QUEUE="https://${firebase}.firebaseio.com/singpath/queues/my-queue" \
		singpath/verifier2:latest bash
.PHONY: bash

test: build
	docker run -ti --rm -e SKIP_BUILD=1 singpath/verifier2 npm test
	docker run -ti --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		--group-add 100 \
		singpath/verifier2 verifier test "$(examples)"
.PHONY: test
