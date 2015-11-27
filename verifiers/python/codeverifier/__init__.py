import doctest
import io
import logging
import sys


__all__ = ['StandardStreams', 'TestRunner']


class StandardStreams:

    def __init__(self, streams=None):
        self.streams = streams if streams else sys
        self.stdout = None
        self.stderr = None
        self.mock = None

    def switch(self):
        if self.stdout is not None or self.stderr is not None:
            return

        if self.mock:
            self.mock.close()
        self.mock = io.StringIO()

        self.stdout = self.streams.stdout
        self.stderr = self.streams.stderr
        self.streams.stdout = self.streams.stderr = self.mock

    def restore(self):
        if self.stdout is None or self.stderr is None:
            raise AttributeError("The standard streams were not switched")

        self.streams.stdout = self.stdout
        self.streams.stderr = self.stderr
        return self.mock

    def close(self):
        if self.mock:
            self.mock.close()


class TestRunner(object):
    """Run some python code and tests the local values it generated
    against test written in doctest.

    """

    FILENAME = '<string>'
    MODE = 'exec'

    @property
    def solved(self):
        if self.errors:
            return False

        return (
            self.results is not None
            and all(r['correct'] for r in self.results if 'correct' in r)
        )

    def __init__(self, solution, tests):
        self.solution = solution
        self.tests = tests
        self.results = None
        self.errors = None
        self.printed = None
        self._globals = {}
        # init _globals
        self._exec('')

    def run(self):
        patcher = StandardStreams()
        patcher.switch()
        try:
            self._run_solution()
            self._run_tests()
        except Exception as e:
            self.errors = str(e)
        finally:
            self.printed = patcher.restore().getvalue()
            patcher.close()

    def to_dict(self):
        data = {
            'solved': self.solved,
            'printed': self.printed
        }
        if self.errors:
            data['errors'] = self.errors
        else:
            data['results'] = self.results

        return data

    def _run_solution(self):
        self._exec(self.solution)
        self._globals['YOUR_SOLUTION'] = self.solution
        self._globals['LINES_IN_YOUR_SOLUTION'] = len(
            self.solution.splitlines()
        )

    def _run_tests(self):
        examples = doctest.DocTestParser().get_examples(self.tests)
        self.results = [self._run_example(e) for e in examples]

    def _run_example(self, example):
        """See https://docs.python.org/3.4/library/doctest.html#doctest.Example

        """
        call = example.source.strip()
        if not example.want:
            self._exec(call)
            return {'call': call}

        expected = self._eval(example.want)
        got = self._eval(call)
        return {
            'call': call,
            'expected': repr(expected),
            'received': repr(got),
            'correct': got == expected
        }

    def _exec(self, source):
        compiled = compile(source, self.FILENAME, self.MODE)
        exec(compiled, self._globals)

    def _eval(self, source):
        return eval(source, self._globals)
