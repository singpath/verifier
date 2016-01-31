# Load testing

## Files:

- `bench.*`: benchmark script for various plateforms.
- `shared.env`: will contain the variables needed to run the verifier and start
  a benchmark. You can use `shared.env.tmpl` as a template.
- `shared.fn`: shared functions
- `samples/*.yaml`: solution the verifier should run. Typically defends a few
  sample that the benchmark will repeat.


## Setup

You need create to `shared.env` using `shared.env.tmpl`. Simply copy it and
edit some of the variables.


## Start

To tests the verifier on the a Google Compute Engine VM:
```
./bench.gce init
./bench.gce start && ./bench.gce stop
./bench.gce start "$(< samples/python.yaml)" && ./bench.gce stop
./bench.gce start "$(< samples/java.yaml)" && ./bench.gce stop
./bench.gce start "$(< samples/javascript.yaml)" && ./bench.gce stop
./bench.gce rm
```
