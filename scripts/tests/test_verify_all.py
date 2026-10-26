"""Exercise verification control flow with disposable commands, never markets."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'verify-all.sh'


class VerificationControlFlow(unittest.TestCase):
    def run_verification(self, failure='', missing=''):
        with tempfile.TemporaryDirectory(prefix='marketweave-verify-') as tmp:
            root = Path(tmp)
            for name in ('core', 'node_modules', 'sdks/python/tests', 'sdks/typescript/tests',
                         'sdks/typescript/node_modules', 'scripts', 'bin'):
                (root / name).mkdir(parents=True, exist_ok=True)
            shutil.copy2(SCRIPT, root / 'scripts/verify-all.sh')
            # Match the real repository: tests exist, but none is integration.test.ts.
            (root / 'sdks/typescript/tests/client.test.ts').write_text('')
            for name in ('npm', 'node', 'python3', 'sleep'):
                command = root / 'bin' / name
                command.write_text('''#!/bin/sh
printf '%s|%s|%s\\n' "${0##*/}" "$PWD" "$*" >> "$VERIFY_LOG"
case "${0##*/}:$PWD:$*" in
  npm:*/core:*build*) stage=build ;;
  npm:*:*pmxt-core*) stage=core ;;
  node:*) stage=server ;;
  python3:*:*pytest*) stage=python ;;
  npm:*/sdks/typescript:*test*) stage=typescript ;;
  *) stage=other ;;
esac
if [ "$stage" = "$VERIFY_FAIL" ]; then exit 7; fi
exit 0
''')
                command.chmod(0o755)
            if missing:
                shutil.rmtree(root / missing)
            log = root / 'calls.log'
            env = dict(os.environ, PATH=f'{root / "bin"}:/usr/bin:/bin',
                       VERIFY_LOG=str(log), VERIFY_FAIL=failure)
            result = subprocess.run(['/bin/bash', str(root / 'scripts/verify-all.sh')],
                                    cwd=root, env=env, text=True, capture_output=True,
                                    timeout=10)
            return result, log.read_text() if log.exists() else ''

    def test_build_failure_cannot_report_success(self):
        result, calls = self.run_verification('build')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertNotIn('All SDK', result.stdout)
        self.assertNotIn('node|', calls)

    def test_each_required_stage_failure_fails_verification(self):
        for stage in ('core', 'python', 'typescript'):
            with self.subTest(stage=stage):
                result, _ = self.run_verification(stage)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn('All SDK', result.stdout)

    def test_existing_named_typescript_suite_runs(self):
        result, calls = self.run_verification()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(calls, r'npm\|[^\n]+/sdks/typescript\|test')
        self.assertIn('--passWithNoTests=false', calls)
        self.assertNotIn('install', calls)
        self.assertIn('All SDK', result.stdout)

    def test_missing_required_sdk_is_not_a_pass(self):
        for directory in ('sdks/python', 'sdks/python/tests', 'sdks/typescript',
                          'sdks/typescript/tests'):
            with self.subTest(directory=directory):
                result, _ = self.run_verification(missing=directory)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn('All SDK', result.stdout)


if __name__ == '__main__':
    unittest.main()
