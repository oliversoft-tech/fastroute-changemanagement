# FastRoute Change Management

Orquestração central da governança de qualidade e release do ecossistema FastRoute.

## Workflow principal

- `/.github/workflows/governance-release.yml`
- `/.github/workflows/impact-analysis.yml`

### Modos

- `repository_dispatch` (`governance-ci`): executa gates automáticos (unit + integração) quando qualquer repositório (`domain`, `api`, `mobile`) dispara o evento.
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
- `OPENAI_API_KEY` (obrigatório para a etapa de codificação automática quando `auto_implement=true`)
- `EXPO_TOKEN`
- `FIREBASE_PROJECT_ID` (GCP/Firebase para Android Robo Test)
- `GCP_SA_KEY` (JSON da service account com permissão de Firebase Test Lab)
- `GHCR_USERNAME`
- `GHCR_PAT`
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

## UI E2E (governance-ci)

- Android (auto-crawl): Firebase Test Lab Robo
  - Runner: `/scripts/e2e/run-android-robo-testlab.sh`
- iOS (simulador): suite do mobile via script npm de crawler
  - Runner: `/scripts/e2e/run-ios-ui-simulator.sh`
  - Script esperado no `fastroute-mobile-hybrid`: `test:ui:ios:crawler`
- Documentação:
  - `/docs/qa/mobile-ui-firebase-ios.md`
