'use strict';

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function levelFrom(score) {
  if (score <= 1) return 'Alta';
  if (score <= 3) return 'Média';
  return 'Baixa';
}

function inferImpact(rawInput) {
  const text = rawInput.toLowerCase();

  const domainTerms = [
    'regra', 'valida', 'invariante', 'status', 'transi', 'fsm', 'waypoint', 'rota', 'cluster'
  ];

  const apiTerms = [
    'api', 'endpoint', 'auth', 'token', 'supabase', 'n8n', 'webhook', 'sync', 'upload', 'route',
    'waypoint', 'database', 'banco', 'rls'
  ];

  const mobileTerms = [
    'mobile', 'android', 'ios', 'app', 'tela', 'ux', 'offline', 'device', 'apk', 'ipa', 'eas'
  ];

  const infraTerms = [
    'vps', 'docker', 'nginx', 'cloudflare', 'ghcr', 'ci', 'workflow', 'deploy', 'pipeline', 'escala'
  ];

  const integrationTerms = [
    'supabase', 'n8n', 'maps', 'google', 'openstreetmap', 'firebase', 'aws', 'apple', 'play store',
    'notifica', 'push notification'
  ];

  const impacts = {
    domain: hasAny(text, domainTerms),
    api: hasAny(text, apiTerms),
    mobile: hasAny(text, mobileTerms),
    infra: hasAny(text, infraTerms),
    integrations: hasAny(text, integrationTerms)
  };

  const riskScore = [impacts.infra, impacts.integrations, impacts.domain && impacts.api && impacts.mobile]
    .filter(Boolean).length;

  return {
    impacts,
    viability: levelFrom(riskScore)
  };
}

function repoReason(name, yes) {
  if (!yes) return 'Sem indício forte no texto da demanda.';

  const reasons = {
    domain: 'Demanda sugere alteração de regras de negócio/estado compartilhado.',
    api: 'Demanda sugere impacto em endpoint, auth, sync ou persistência.',
    mobile: 'Demanda sugere impacto direto em UX/fluxo mobile/offline.',
    infra: 'Demanda sugere alteração operacional de deploy/infraestrutura.',
    integrations: 'Demanda sugere dependência de fornecedor/serviço externo.'
  };

  return reasons[name];
}

const requestText = process.argv.slice(2).join(' ').trim();
if (!requestText) {
  console.error('Uso: node scripts/governance/analyze-impact.js "<texto da demanda>"');
  process.exit(1);
}

const result = inferImpact(requestText);

const rows = [
  ['fastroute-domain', result.impacts.domain, repoReason('domain', result.impacts.domain)],
  ['fastroute-api', result.impacts.api, repoReason('api', result.impacts.api)],
  ['fastroute-mobile-hybrid', result.impacts.mobile, repoReason('mobile', result.impacts.mobile)],
  ['Infra (VPS/Nginx/Cloudflare/GHCR)', result.impacts.infra, repoReason('infra', result.impacts.infra)],
  ['Integrações externas', result.impacts.integrations, repoReason('integrations', result.impacts.integrations)]
];

const markdown = [
  '# Análise Inicial de Impacto e Viabilidade',
  '',
  '## Solicitação (linguagem natural)',
  requestText,
  '',
  '## Matriz de impacto',
  '| Área | Impacto | Evidência inicial |',
  '|---|---|---|',
  ...rows.map(([area, yes, reason]) => `| ${area} | ${yes ? 'Sim' : 'Não'} | ${reason} |`),
  '',
  '## Viabilidade inicial',
  `Classificação: **${result.viability}**`,
  '',
  '## Próximos passos recomendados',
  '1. Validar se os impactos marcados como "Sim" refletem o escopo real.',
  '2. Detalhar esforço por repositório (S/M/L) e riscos de rollback.',
  '3. Confirmar necessidade de novas credenciais, serviços ou infraestrutura.'
].join('\n');

process.stdout.write(markdown + '\n');
