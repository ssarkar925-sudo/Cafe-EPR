from pathlib import Path
import subprocess

POS = Path('components/pos/pos-client.tsx')
QUICK = Path('components/pos/quick-sale.tsx')
MARKER = Path('quick-pos-ui-trigger.txt')

pos = POS.read_text(encoding='utf-8')
quick = QUICK.read_text(encoding='utf-8')

old_top = '''          {mode === "quick" && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true }))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              title="Open Recent Quick Sales (F1)"
            >
              <span className="text-sm leading-none">↻</span>
              <span>Recent Sales</span>
            </button>
          )}

'''
if old_top in pos:
    pos = pos.replace(old_top, '', 1)

new_recent = '''                <button
                  type="button"
                  onClick={() => setRecentOpen(true)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-600 transition hover:bg-violet-50"
                  title="Open recent quick sales"
                >
                  ↻ Recent Sales
                </button>
'''
if 'title="Open recent quick sales"' not in quick:
    anchor = '''              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRecallOpen(true)'''
    if anchor not in quick:
        raise SystemExit('Quick Sale header action group not found')
    quick = quick.replace(anchor, '              <div className="flex items-center gap-1.5">\n' + new_recent + '                <button\n                  onClick={() => setRecallOpen(true)', 1)

old_actions = '''              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={holdCart}
                  disabled={payDisabled}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hold Sale
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => record(false)}
                  disabled={payDisabled}
                  className="rounded-xl bg-[#0f172a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ₹ Pay
                </button>
              </div>
'''
new_actions = '''              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={holdCart}
                  disabled={payDisabled}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hold Sale
                </button>
                <button
                  onClick={() => record(false)}
                  disabled={payDisabled}
                  className="rounded-xl bg-[#0f172a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ₹ Pay
                </button>
              </div>
'''
if old_actions in quick:
    quick = quick.replace(old_actions, new_actions, 1)

POS.write_text(pos, encoding='utf-8')
QUICK.write_text(quick, encoding='utf-8')

MARKER.unlink(missing_ok=True)
Path('.github/workflows/move_quick_recent_sales.yml').unlink(missing_ok=True)
Path('.github/workflows/fix_quick_pos_recent_sales.yml').unlink(missing_ok=True)
Path('.github/scripts/fix_quick_pos_recent_sales.py').unlink(missing_ok=True)

subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', 'components/pos/pos-client.tsx', 'components/pos/quick-sale.tsx', '.github/workflows/move_quick_recent_sales.yml', '.github/workflows/fix_quick_pos_recent_sales.yml', '.github/scripts/fix_quick_pos_recent_sales.py', 'quick-pos-ui-trigger.txt'], check=True)
if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode == 0:
    raise SystemExit(0)
subprocess.run(['git', 'commit', '-m', 'fix: place quick POS recent sales in cart header'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:main'], check=True)
