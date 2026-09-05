from pathlib import Path
import re
import subprocess

quick = Path("components/pos/quick-sale.tsx")
s = quick.read_text(encoding="utf-8")

pattern = re.compile(
    r'(?P<indent> {14})<div className="mt-3 grid grid-cols-2 gap-2">\n'
    r'(?P<hold>.*?)\n'
    r'(?P=indent)</div>\n'
    r'(?P=indent)<div className="mt-2 grid grid-cols-2 gap-2">\n'
    r'(?P<pay>.*?)\n'
    r'(?P=indent)</div>',
    re.S,
)

m = pattern.search(s)
if m:
    indent = m.group("indent")
    replacement = (
        f'{indent}<div className="mt-3 grid grid-cols-2 gap-2">\n'
        f'{m.group("hold")}\n'
        f'{m.group("pay")}\n'
        f'{indent}</div>'
    )
    s = s[:m.start()] + replacement + s[m.end():]
    quick.write_text(s, encoding="utf-8")
    print("Compacted Hold Sale and Pay into one action row.")
else:
    print("Action row already compact or pattern not found.")

for helper in (
    Path("scripts/finish_quick_pos.py"),
    Path(".github/workflows/finish_quick_pos_actions.yml"),
):
    helper.unlink(missing_ok=True)

if subprocess.run(["git", "diff", "--quiet"]).returncode == 0:
    print("No changes to commit.")
    raise SystemExit(0)

subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
subprocess.run(["git", "add", "components/pos/quick-sale.tsx", "scripts/finish_quick_pos.py", ".github/workflows/finish_quick_pos_actions.yml"], check=True)
subprocess.run(["git", "commit", "-m", "style: compact quick sale action row"], check=True)
subprocess.run(["git", "push", "origin", "HEAD:main"], check=True)
