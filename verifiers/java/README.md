# Java Verifier for SingPath.com

Compile a Java class in memory and run junit test against it inside a docker
container.

## Usage

To download the the docker image and run the solutions and its tests.

```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-java:latest \
	verify '---
tests: |
  SingPath sp = new SingPath();
  assertEquals(2.0, sp.add());
solution: |
  public class SingPath {
    public Double add() {
      return 2.0;
    }
  }
'
```

You can provide the solution/tests payload as JSON or YAML. If in YAML, the
YAML document must start with "---".

To pass the content of a file:
```shell
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-java:latest \
	verify "$(< examples/float.yaml)"
```

To build the verifier instead of downloading it:
```shell
git clone https://github.com/ChrisBoesch/singpath-verifiers.git
cd singpath-verifiers/java
make
docker run -ti --rm \
	--net="none" \
	--cap-drop=ALL \
	singpath/verifier2-java:latest \
	verify '---
tests: |
  SingPath sp = new SingPath();
  assertEquals(2.0, sp.add());
solution: |
  public class SingPath {
    public Double add() {
      return 2.0;
    }
  }
'
```