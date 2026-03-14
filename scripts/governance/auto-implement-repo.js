#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function run(cmd, cwd) {
  const res = spawnSync('bash', ['-lc', cmd], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (res.status !== 0) {
    const out = (res.stdout || '').trim();
    const err = (res.stderr || '').trim();
    throw new Error(`Command failed: ${cmd}\n${out}\n${err}`);
  }
  return (res.stdout || '').trim();
}

function runAllowFail(cmd, cwd) {
  const res = spawnSync('bash', ['-lc', cmd], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim()
  };
}

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function loadJsonFile(filePath, fallback) {
  if (!filePath) return fallback;
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function isRepoMatch(repo, repoKey, repoName) {
  const r = norm(repo);
  const k = norm(repoKey);
  const n = norm(repoName);
  if (!n) return false;

  if (n === r) return true;
  if (n === k) return true;

  if (k === 'domain') {
    return n.includes('domain') || n === 'fastroute-domain';
  }
  if (k === 'api') {
    return n === 'api' || n.includes('fastroute-api') || n.includes('fastroute_api') || n.endsWith('-api');
  }
  if (k === 'mobile') {
    return n.includes('mobile') || n.includes('fastroute-mobile-hybrid');
  }

  return false;
}

function normalizeGroupedChanges(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray(raw.grouped_changes)) return raw.grouped_changes;
  return [];
}

function readImpact(repo, repoKey, impact) {
  const impacts = (impact && (impact.impactos || impact.impacts)) || {};
  const entries = Object.entries(impacts || {});

  const aliases = [
    repo,
    repoKey,
    repo === 'fastroute-domain' ? 'domain' : '',
    repo === 'fastroute-api' ? 'api' : '',
    repo === 'fastroute-mobile-hybrid' ? 'mobile' : ''
  ].filter(Boolean);

  let info = {};
  for (const alias of aliases) {
    const hit = entries.find(([k]) => norm(k) === norm(alias));
    if (hit) {
      info = hit[1] || {};
      break;
    }
  }

  return {
    impacted: info.impacto === true || info.impact === true || info.has_impact === true,
    raw: info,
  };
}

function parseSnippet(snippet, idx) {
  const raw = String(snippet || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    throw new Error(`code_change[${idx}] is empty`);
  }

  const lines = raw.split('\n');
  const first = String(lines[0] || '').trim();
  const fileMatch = first.match(/^\/\/\s*file:\s*(.+)$/i);
  if (!fileMatch) {
    throw new Error(`code_change[${idx}] missing required header "// file: <path>"`);
  }

  const filePath = String(fileMatch[1] || '').trim().replace(/^['"]|['"]$/g, '');
  if (!filePath || path.isAbsolute(filePath) || filePath.includes('..')) {
    throw new Error(`code_change[${idx}] has invalid file path: ${filePath}`);
  }

  const content = lines.slice(1).join('\n').replace(/^\n+/, '');
  if (!content.trim()) {
    throw new Error(`code_change[${idx}] has no file content for ${filePath}`);
  }

  return { filePath, content };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function summaryFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  return firstText(
    row.change_summary,
    row.changeSummary,
    row.summary,
    row.descricao,
    row.description,
    row.desc,
    row.titulo,
    row.title,
    row.change_title,
    row.changeTitle
  );
}

function summariesFromImpact(repoImpact) {
  const raw = (repoImpact && repoImpact.raw) || {};
  const changes = Array.isArray(raw.mudancas)
    ? raw.mudancas
    : Array.isArray(raw.changes)
      ? raw.changes
      : [];

  return changes
    .map((change) => {
      if (typeof change === 'string') return String(change).trim();
      if (!change || typeof change !== 'object') return '';
      return firstText(
        change.descricao,
        change.description,
        change.desc,
        change.change_summary,
        change.summary,
        change.titulo,
        change.title
      );
    })
    .filter(Boolean);
}

function buildChangeMap(rowsForRepo, impactSummaries) {
  const bySummary = new Map();
  let impactSummaryCursor = 0;

  for (let rowIndex = 0; rowIndex < rowsForRepo.length; rowIndex += 1) {
    const row = rowsForRepo[rowIndex] || {};
    const rowSnippets = Array.isArray(row.code_changes) ? row.code_changes : [];
    const files = new Set();

    for (let snippetIndex = 0; snippetIndex < rowSnippets.length; snippetIndex += 1) {
      const rawSnippet = String(rowSnippets[snippetIndex] || '').trim();
      if (!rawSnippet) continue;
      try {
        files.add(parseSnippet(rawSnippet, snippetIndex).filePath);
      } catch (_err) {
        // Invalid snippet is already handled by applyCodeChanges.
      }
    }

    if (files.size === 0) continue;

    let summary = summaryFromRow(row);
    if (!summary && impactSummaryCursor < impactSummaries.length) {
      summary = impactSummaries[impactSummaryCursor];
      impactSummaryCursor += 1;
    }
    if (!summary) {
      summary = `Mudanca tecnica ${rowIndex + 1}`;
    }

    if (!bySummary.has(summary)) {
      bySummary.set(summary, new Set());
    }
    const summaryFiles = bySummary.get(summary);
    for (const filePath of files) {
      summaryFiles.add(filePath);
    }
  }

  return Array.from(bySummary.entries()).map(([summary, files]) => ({
    summary,
    files: Array.from(files).sort(),
  }));
}

function applyCodeChanges(repoDir, snippets) {
  const planned = new Map();

  for (let i = 0; i < snippets.length; i += 1) {
    const parsed = parseSnippet(snippets[i], i);
    planned.set(parsed.filePath, parsed.content);
  }

  for (const [filePath, content] of planned.entries()) {
    const abs = path.join(repoDir, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }

  run('git add -A', repoDir);
  const hasDiff = runAllowFail('git diff --cached --quiet', repoDir);
  return { changed: !hasDiff.ok, files: [...planned.keys()] };
}

async function main() {
  const args = parseArgs(process.argv);
  const owner = args.owner || process.env.OWNER;
  const repo = args.repo || process.env.REPO;
  const repoKey = args.repo_key || process.env.REPO_KEY;
  const ref = args.ref || process.env.REF;
  const runId = args.run_id || process.env.RUN_ID || 'manual';
  const impactPath = args.impact_json_file || process.env.IMPACT_JSON_FILE;
  const codeChangesPath = args.code_changes_json_file || process.env.CODE_CHANGES_JSON_FILE;
  const token = args.token || process.env.TOKEN;

  if (!owner || !repo || !repoKey || !ref || !token) {
    throw new Error('Missing required arguments: owner, repo, repo_key, ref, token');
  }

  const impact = loadJsonFile(impactPath, {});
  const repoImpact = readImpact(repo, repoKey, impact);
  const groupedChanges = normalizeGroupedChanges(loadJsonFile(codeChangesPath, []));

  const rowsForRepo = groupedChanges.filter((row) => isRepoMatch(repo, repoKey, row && row.repo_name));
  const impactSummaries = summariesFromImpact(repoImpact);
  const changeMap = buildChangeMap(rowsForRepo, impactSummaries);
  const snippets = rowsForRepo
    .flatMap((row) => (Array.isArray(row?.code_changes) ? row.code_changes : []))
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  if (snippets.length === 0) {
    if (repoImpact.impacted) {
      throw new Error(
        `Repo ${repo} marked as impacted, but no code_changes were provided in dispatch payload. ` +
        `Expected client_payload.code_changes grouped by repo_name.`
      );
    }

    process.stdout.write(JSON.stringify({ status: 'skipped_not_impacted', repo, reason: 'no_code_changes' }) + '\n');
    return;
  }

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `fastroute-impl-${repoKey}-`));
  const repoDir = path.join(workdir, 'repo');
  run(`git clone "https://x-access-token:${token}@github.com/${owner}/${repo}.git" "${repoDir}"`);

  const checkout = runAllowFail(`git checkout "${ref}"`, repoDir);
  if (!checkout.ok) {
    const branchFromOrigin = runAllowFail(`git checkout -B "${ref}" "origin/${ref}"`, repoDir);
    if (!branchFromOrigin.ok) {
      run(`git checkout "${ref}"`, repoDir);
    }
  }

  const desiredBranch = String(ref).startsWith('codex/governance-')
    ? String(ref)
    : `codex/governance-${runId}-${repoKey}`;

  const currentBranch = run('git rev-parse --abbrev-ref HEAD', repoDir);
  if (currentBranch === 'HEAD') {
    run(`git checkout -B "${desiredBranch}"`, repoDir);
  } else if (currentBranch !== desiredBranch) {
    const checkoutDesired = runAllowFail(`git checkout "${desiredBranch}"`, repoDir);
    if (!checkoutDesired.ok) {
      run(`git checkout -b "${desiredBranch}"`, repoDir);
    }
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', repoDir);
  const result = applyCodeChanges(repoDir, snippets);

  if (!result.changed) {
    process.stdout.write(JSON.stringify({
      status: 'skipped_no_changes',
      repo,
      branch,
      files: result.files,
      snippets: snippets.length,
      change_map: changeMap,
    }) + '\n');
    return;
  }

  run('git config user.name "FastRoute Governance Bot"', repoDir);
  run('git config user.email "governance-bot@users.noreply.github.com"', repoDir);
  run(`git commit -m "feat(governance): apply precomputed code changes (${repoKey}) run ${runId}"`, repoDir);
  run(`git push -u origin "${branch}"`, repoDir);

  const commit = run('git rev-parse HEAD', repoDir);
  process.stdout.write(JSON.stringify({
    status: 'implemented',
    repo,
    branch,
    commit,
    files: result.files,
    snippets: snippets.length,
    rows: rowsForRepo.length,
    change_map: changeMap,
  }) + '\n');
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
