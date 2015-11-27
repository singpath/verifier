import io
import unittest

from codeverifier import StandardStreams


class TestStandardStreams(unittest.TestCase):

    def setUp(self):
        class MySys:
            stdout = io.StringIO()
            stderr = io.StringIO()

        self.sys = MySys

    def tearDown(self):
        self.sys.stdout.close()
        self.sys.stderr.close()

    def test_switch(self):
        stdout, stderr = self.sys.stdout, self.sys.stderr
        patcher = StandardStreams(self.sys)
        patcher.switch()

        self.assertIsNot(stdout, self.sys.stdout)
        self.assertIsNot(stderr, self.sys.stderr)
        self.assertIs(patcher.mock, self.sys.stdout)
        self.assertIs(patcher.mock, self.sys.stderr)

        patcher.close()

    def test_restore(self):
        patcher = StandardStreams(self.sys)
        patcher.switch()
        self.sys.stdout.write('out')
        self.sys.stderr.write('err')

        mock = patcher.restore()
        self.assertEqual('outerr', mock.getvalue())
        patcher.close()

        self.assertEqual('', self.sys.stdout.getvalue())
        self.assertEqual('', self.sys.stderr.getvalue())
