# FastRoute Change Management

Orquestração central da governança de qualidade e release do ecossistema FastRoute.

## Workflow principal

- `/.github/workflows/governance-release.yml`
- `/.github/workflows/impact-analysis.yml`

### Modos

- `repository_dispatch` (`governance-ci`): executa gates automáticos (unit + integração + UI Android/iOS) quando qualquer repositório (`domain`, `api`, `mobile`) dispara o evento.
- `workflow_dispatch`: execução manual com refs específicas e opção de release:
  - build de artefatos mobile (APK + iOS package via EAS)
  - build/push da imagem Docker da API
  - deploy opcional da API na VPS

## Análise inicial de impacto

- Workflow: `/.github/workflows/impact-analysis.yml`
- Script: `/scripts/governance/analyze-impact.js`
- Playbook: `/docs/governance/impact-analysis-playbook.md`

## Segredos necessários

- `CROSS_REPO_PAT`
- `EXPO_TOKEN`
- `GHCR_USERNAME`
- `GHCR_PAT`
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
