# E2E Sync (Maestro) - Legado

> Status: legado. O `governance-ci` agora usa Firebase Test Lab (Android) e iOS simulator crawler.
> Referência atual: `/docs/qa/mobile-ui-firebase-ios.md`

## Objetivo
Validar a rotina de sincronização do app mobile cobrindo todas as operações de domínio disponíveis no fluxo funcional.

## Fluxo versionado
- Arquivo: `/.maestro/flows/flow-sync-all-operations.yaml`
- Runner: `/scripts/e2e/run-sync-e2e.sh`

## Operações cobertas
- `IMPORT_ROUTE_FILE`
- `REORDER_WAYPOINTS`
- `START_ROUTE`
- `UPDATE_WAYPOINT_STATUS` (falha e entregue)
- `FINISH_ROUTE` (auto-finish após concluir todos os waypoints)
- `DELETE_ROUTE`
- `syncNow('manual')` via tela de Configurações

## Pré-requisitos
1. App `com.oliverbill.fastroutemobile` instalado no simulador/dispositivo.
2. Build com suporte ao bootstrap E2E por deeplink:
   - `fastroute://e2e/bootstrap`
3. Java 17+ instalado.
4. Maestro CLI instalado (o runner instala automaticamente quando necessário).

## Execução
```bash
cd /Users/william/vscode-projects/fastroute-changemanagement
./scripts/e2e/run-sync-e2e.sh
```

## Resultado esperado
- Arquivo JUnit em: `/.maestro/results/junit-sync-all-operations.xml`
- Artefatos de debug em: `/.maestro/debug/...`

## Observações
- O fluxo é estrito: ele espera `Sync concluído` ao final.
- Se houver regressão de backend (ex.: mutações rejeitadas), o teste deve falhar para sinalizar bloqueio de release.
