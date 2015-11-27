import json
import unittest

from codeverifier import TestRunner


class TestTestRunner(unittest.TestCase):

    def test_run_one_line(self):
        runner = TestRunner(
            solution='foo = 1',
            tests='>>> foo\n1'
        )
        runner.run()
        self.assertEqual(1, len(runner.results))
        self.assertEqual(
            {
                'call': 'foo',
                'expected': '1',
                'received': '1',
                'correct': True
            },
            runner.results[0]
        )
        self.assertEqual(True, runner.solved)
        self.assertEqual('', runner.printed)

    def test_run_unsolved(self):
        runner = TestRunner(
            solution='foo = 2',
            tests='>>> foo\n1'
        )
        runner.run()
        self.assertEqual(1, len(runner.results))
        self.assertEqual(
            {
                'call': 'foo',
                'expected': '1',
                'received': '2',
                'correct': False
            },
            runner.results[0]
        )
        self.assertEqual(False, runner.solved)

    def test_run_except(self):
        runner = TestRunner(
            solution='foo = bar',
            tests='>>> foo\n1'
        )
        runner.run()
        self.assertIsNone(runner.results)
        self.assertEqual("name 'bar' is not defined", runner.errors)
        self.assertEqual(False, runner.solved)

    def test_to_dict_solved(self):
        runner = TestRunner(
            solution='foo = 1',
            tests='>>> foo\n1'
        )
        runner.run()
        data = runner.to_dict()

        self.assertEqual(
            {'solved', 'results', 'printed'},
            {k for k in data}
        )
        self.assertTrue(data['solved'])
        self.assertEqual(
            [{
                'call': 'foo',
                'expected': '1',
                'received': '1',
                'correct': True
            }],
            data['results']
        )
        self.assertEqual('', data['printed'])

    def test_list_comprehension(self):
        runner = TestRunner(
            solution='def foo(x):\n  return x*2',
            tests='>>> [foo(x) for x in [1,2]]\n [2, 4]'
        )
        runner.run()
        data = runner.to_dict()
        self.assertTrue(data['solved'])
        self.assertEqual(
            [{
                'call': '[foo(x) for x in [1,2]]',
                'expected': '[2, 4]',
                'received': '[2, 4]',
                'correct': True
            }],
            data['results']
        )
        self.assertEqual('', data['printed'])

    def test_empty_test_output(self):
        runner = TestRunner(
            solution='a=1',
            tests='>>> a=2'
        )
        runner.run()
        data = runner.to_dict()

        self.assertEqual(
            [{
                'call': 'a=2'
            }],
            data.get('results')
        )
        self.assertEqual('', data['printed'])
        self.assertTrue(data['solved'])
        self.assertIsNone(data.get('errors'))
