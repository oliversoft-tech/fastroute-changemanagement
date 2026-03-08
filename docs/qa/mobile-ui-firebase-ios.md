# Mobile UI no Governance CI (Firebase + iOS Simulator)

## Objetivo
Substituir a dependência de Maestro no gate de UI do `governance-ci` por:
- Android: Firebase Test Lab (`robo`)
- iOS: simulador local no runner macOS com suíte de crawler do próprio app

## Jobs no workflow central
- `prepare-mobile-ui-artifacts`
- `quality-gates-mobile-ui-android`
- `quality-gates-mobile-ui-ios`

Ambos rodam apenas quando:
- `ci_approved == true`
- `mobile_impacted == true`

O job `prepare-mobile-ui-artifacts` localiza (por SHA) um run bem-sucedido do workflow
`mobile-ui-artifacts.yml` no repositório `fastroute-mobile-hybrid` e baixa os artefatos pré-build.

## Segredos necessários
- `FIREBASE_PROJECT_ID`
- `GCP_SA_KEY` (JSON de service account)

Permissões mínimas recomendadas da service account:
- Firebase Test Lab Admin (ou papel equivalente no projeto)
- Storage Admin/Viewer conforme política de artefatos do projeto

## Android (Firebase Robo)
Runner:
- `scripts/e2e/run-android-robo-testlab.sh`

Comportamento:
1. Baixa APK pré-compilado do workflow `mobile-ui-artifacts.yml`
2. Executa `gcloud firebase test android run --type robo` com timeout curto (`180s`)

Variáveis úteis:
- `ANDROID_ROBO_TIMEOUT` (default `180s`)
- `ANDROID_ROBO_DEVICE_MODEL` (default `Pixel2`)
- `ANDROID_ROBO_VERSION` (default `30`)
- `ANDROID_ROBO_LOCALE` (default `pt_BR`)
- `ANDROID_ROBO_ORIENTATION` (default `portrait`)
- `ANDROID_APP_APK` (opcional para reaproveitar APK já pronto)

## iOS (Simulator crawler)
Runner:
- `scripts/e2e/run-ios-ui-simulator.sh`

Contrato obrigatório no `fastroute-mobile-hybrid`:
- Script npm: `test:ui:ios:crawler`

Comportamento:
1. Baixa `FastRoute.app.zip` pré-compilado do workflow `mobile-ui-artifacts.yml`
2. Inicializa simulador iOS (default `iPhone 15`)
3. Executa `npm run test:ui:ios:crawler` com `IOS_APP_PATH` (sem `xcodebuild` no gate)

Se o script `test:ui:ios:crawler` não existir, o gate falha por design.

## Meta de tempo
- PR gate: smoke com timeout de 3 a 5 minutos por plataforma.
- Cobertura completa: rodar em janela separada (nightly/release) para evitar aumento de lead time do PR.
