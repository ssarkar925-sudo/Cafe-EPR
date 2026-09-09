import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "components/business/recharge-workspace.tsx",
  "components/business/google-play-workspace.tsx",
  "components/business/utility-bill-workspace.tsx",
];

function repair(content) {
  let next = content;

  next = next.replace(
    /<div className="overflow-x-auto([^\"]*)">\s*<table className="w-full text-left text-xs">/g,
    (_match, tail) => `<div className="transaction-history-table overflow-hidden${tail}">\n          <table className="w-full table-fixed text-left text-xs">`
  );

  next = next.replace(
    /<table className="w-full text-left text-xs">/g,
    `<table className="w-full table-fixed text-left text-xs">`
  );

  return next;
}

for (const relative of files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  const after = repair(before);
  if (before !== after) fs.writeFileSync(file, after, "utf8");
}
