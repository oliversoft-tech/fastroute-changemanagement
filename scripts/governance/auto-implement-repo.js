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

function readImpact(repo, repoKey, impact) {
  const impacts = impact.impactos || impact.impacts || {};
  const aliases = [
    repo,
    repoKey,
    repo === 'fastroute-domain' ? 'domain' : '',
    repo === 'fastroute-api' ? 'api' : '',
    repo === 'fastroute-mobile-hybrid' ? 'mobile' : ''
  ].filter(Boolean);

  const entries = Object.entries(impacts);
  let info = {};
  for (const alias of aliases) {
    const hit = entries.find(([k]) => norm(k) === norm(alias));
    if (hit) {
      info = hit[1] || {};
      break;
    }
  }

  const impacted = info.impacto === true || info.impact === true || info.has_impact === true;
  const changesRaw = Array.isArray(info.mudancas || info.changes) ? (info.mudancas || info.changes) : [];
  const changes = changesRaw.map((change) => {
    if (typeof change === 'string') {
      return { descricao: change, testes: [], criterios_aceite: [] };
    }
    const c = change && typeof change === 'object' ? change : {};
    return {
      descricao: String(c.descricao || c.desc || c.description || '').trim(),
      testes: Array.isArray(c.testes || c.tests || c.test_steps) ? (c.testes || c.tests || c.test_steps) : [],
      criterios_aceite: Array.isArray(c.criterios_aceite || c.acceptance_criterias || c.acceptance_criteria)
        ? (c.criterios_aceite || c.acceptance_criterias || c.acceptance_criteria)
        : []
    };
  });

  return {
    impacted,
    changes,
    risks: Array.isArray(info.riscos || info.change_risks || info.risks) ? (info.riscos || info.change_risks || info.risks) : [],
    doubts: Array.isArray(info.duvidas || info.change_doubts || info.doubts) ? (info.duvidas || info.change_doubts || info.doubts) : []
  };
}

function pickContextFiles(repoKey, allFiles, changes) {
  const baseByRepo = {
    domain: ['src/index.ts', 'src/types.ts'],
    api: ['src/index.ts', 'src/app.ts'],
    mobile: ['src/screens/MapScreen.tsx', 'src/api/ordersApi.ts', 'package.json']
  };

  const keywords = new Set();
  const addWords = (text) => {
    String(text || '')
      .split(/[^a-zA-Z0-9_./-]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 4)
      .forEach((w) => keywords.add(w));
  };

  for (const c of changes) {
    addWords(c.descricao);
    for (const t of c.testes || []) addWords(t);
    for (const a of c.criterios_aceite || []) addWords(a);
  }

  const weighted = allFiles.map((file) => {
    const lower = file.toLowerCase();
    let score = 0;
    if (lower.startsWith('src/')) score += 2;
    if (lower.includes('test') || lower.endsWith('.test.ts') || lower.endsWith('.spec.ts')) score += 2;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3;
    }
    return { file, score };
  });

  weighted.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const f of baseByRepo[repoKey] || []) {
    if (allFiles.includes(f)) selected.push(f);
  }
  for (const item of weighted) {
    if (item.score <= 0) break;
    if (!selected.includes(item.file)) selected.push(item.file);
    if (selected.length >= 10) break;
  }

  if (selected.length === 0) {
    for (const file of allFiles) {
      if (file.startsWith('src/') || file.endsWith('package.json') || file.includes('test')) {
        selected.push(file);
      }
      if (selected.length >= 8) break;
    }
  }

  return selected.slice(0, 12);
}

function buildPrompt(payload, repoTree, fileContexts) {
  const system = [
    'You are a senior software engineer working in a production monorepo context.',
    'Return ONLY a valid unified git diff patch.',
    'Do not return markdown fences.',
    'Modify only files that belong to this repository.',
    'Implement the requested changes with real code, including tests where appropriate.',
    'Keep changes minimal and coherent.'
  ].join('\n');

  const user = [
    'Implement the following repository-scoped impact request.',
    '',
    'REQUEST_PAYLOAD_JSON:',
    JSON.stringify(payload, null, 2),
    '',
    'REPOSITORY_TREE (truncated):',
    repoTree,
    '',
    'RELEVANT_FILE_CONTEXT:',
    fileContexts,
    '',
    'Output format requirements:',
    '- Standard unified diff with headers (diff --git / --- / +++ / @@).',
    '- Include test updates when behavior changes.',
    '- Do not include prose.'
  ].join('\n');

  return { system, user };
}

function extractDiff(text) {
  let out = String(text || '').trim();
  if (!out) return '';
  out = out.replace(/^```(?:diff)?/i, '').replace(/```$/i, '').trim();
  const idx = out.indexOf('diff --git');
  if (idx >= 0) {
    out = out.slice(idx).trim();
  }
  return out;
}

async function callAnthropic({ apiKey, model, system, user }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system,
      temperature: 0.1,
      max_tokens: 4000,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${body.slice(0, 800)}`);
  }

  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch (_e) {
    throw new Error(`Anthropic returned non-JSON body: ${body.slice(0, 800)}`);
  }

  const content = Array.isArray(parsed?.content)
    ? parsed.content
      .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
      .map((item) => item.text)
      .join('\n')
    : '';
  return String(content || '').trim();
}

async function main() {
  const args = parseArgs(process.argv);
  const owner = args.owner || process.env.OWNER;
  const repo = args.repo || process.env.REPO;
  const repoKey = args.repo_key || process.env.REPO_KEY;
  const ref = args.ref || process.env.REF;
  const runId = args.run_id || process.env.RUN_ID || 'manual';
  const impactPath = args.impact_json_file || process.env.IMPACT_JSON_FILE;
  const token = args.token || process.env.TOKEN;
  const model = args.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  const apiKey = args.anthropic_api_key || process.env.ANTHROPIC_API_KEY;

  if (!owner || !repo || !repoKey || !ref || !impactPath || !token) {
    throw new Error('Missing required arguments: owner, repo, repo_key, ref, impact_json_file, token');
  }

  const rawImpact = fs.readFileSync(impactPath, 'utf8');
  const impact = rawImpact && rawImpact.trim() ? JSON.parse(rawImpact) : {};
  const repoImpact = readImpact(repo, repoKey, impact);

  if (!repoImpact.impacted) {
    process.stdout.write(JSON.stringify({ status: 'skipped_not_impacted', repo }) + '\n');
    return;
  }

  if (!apiKey) throw new Error(`ANTHROPIC_API_KEY is required to auto-implement impacted repo ${repo}.`);

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

  const currentBranch = run('git rev-parse --abbrev-ref HEAD', repoDir);
  if (currentBranch === 'HEAD') {
    run(`git checkout -B "codex/governance-${runId}-${repoKey}"`, repoDir);
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', repoDir);
  const allFiles = run('git ls-files', repoDir).split('\n').map((f) => f.trim()).filter(Boolean);
  const selectedFiles = pickContextFiles(repoKey, allFiles, repoImpact.changes);

  const fileContexts = [];
  for (const file of selectedFiles) {
    const filePath = path.join(repoDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const truncated = content.length > 12000 ? `${content.slice(0, 12000)}\n/* [truncated] */` : content;
      fileContexts.push(`FILE: ${file}\n${truncated}\n`);
    } catch (_e) {
      // best effort
    }
  }

  const repoTree = run('git ls-files | head -n 500', repoDir);
  const payload = {
    run_id: runId,
    repo,
    repo_key: repoKey,
    ref,
    summary: impact.resumo || impact.summary || '',
    viability: impact.viabilidade || impact.viability || {},
    repo_impact: repoImpact
  };
  const { system, user } = buildPrompt(payload, repoTree, fileContexts.join('\n'));

  const llmText = await callAnthropic({ apiKey, model, system, user });
  const diffText = extractDiff(llmText);
  if (!diffText || !diffText.includes('diff --git')) {
    throw new Error(`LLM did not return a valid git diff for ${repo}.`);
  }

  const patchPath = path.join(workdir, 'changes.diff');
  fs.writeFileSync(patchPath, diffText, 'utf8');

  const applyStrict = runAllowFail(`git apply --index --whitespace=nowarn "${patchPath}"`, repoDir);
  if (!applyStrict.ok) {
    const applyRelaxed = runAllowFail(`git apply --reject --whitespace=nowarn "${patchPath}"`, repoDir);
    if (!applyRelaxed.ok) {
      throw new Error(`Could not apply generated patch for ${repo}.\n${applyStrict.stderr}\n${applyRelaxed.stderr}`);
    }
    run('git add -A', repoDir);
  }

  const hasDiff = runAllowFail('git diff --cached --quiet', repoDir);
  if (hasDiff.ok) {
    process.stdout.write(JSON.stringify({ status: 'skipped_no_changes', repo, branch }) + '\n');
    return;
  }

  run('git config user.name "FastRoute Governance Bot"', repoDir);
  run('git config user.email "governance-bot@users.noreply.github.com"', repoDir);
  run(`git commit -m "feat(governance): implement impact changes (${repoKey}) run ${runId}"`, repoDir);
  run(`git push origin "${branch}"`, repoDir);

  const commit = run('git rev-parse HEAD', repoDir);
  process.stdout.write(JSON.stringify({ status: 'implemented', repo, branch, commit }) + '\n');
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
