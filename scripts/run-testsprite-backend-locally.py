"""Run a TestSprite backend test file locally the way TestSprite does:
inject TARGET_URL and __AUTH_HEADERS__ as module globals, then exec it.
The token is read from a file and never printed."""
import sys
import traceback
from pathlib import Path

target = sys.argv[1]
token_file = sys.argv[2]
files = sys.argv[3:]

token = Path(token_file).read_text(encoding="utf-8").strip()
headers = {"Authorization": "Bearer " + token}

failures = 0
for f in files:
    src = Path(f).read_text(encoding="utf-8")
    g = {
        "__name__": "__main__",
        "TARGET_URL": target,
        "__AUTH_HEADERS__": dict(headers),
    }
    name = Path(f).name
    try:
        compile(src, f, "exec")
    except SyntaxError as e:
        print("SYNTAX  %-42s line %s: %s" % (name, e.lineno, e.msg))
        failures += 1
        continue
    try:
        exec(compile(src, f, "exec"), g)
        print("PASS    %s" % name)
    except AssertionError as e:
        print("FAIL    %-42s %s" % (name, str(e)[:250]))
        failures += 1
    except Exception as e:
        print("ERROR   %-42s %s: %s" % (name, type(e).__name__, str(e)[:220]))
        traceback.print_exc(limit=2)
        failures += 1

print("\n%d file(s), %d failing" % (len(files), failures))
sys.exit(1 if failures else 0)
