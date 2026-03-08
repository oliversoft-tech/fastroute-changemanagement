# Mobile UI no Governance CI (Firebase + iOS Simulator)

## Objetivo
Substituir a dependência de Maestro no gate de UI do `governance-ci` por:
- Android: Firebase Test Lab (`robo`)
- iOS: simulador local no runner macOS com suíte de crawler do próprio app

## Jobs no workflow central
- `quality-gates-mobile-ui-android`
- `quality-gates-mobile-ui-ios`

Ambos rodam apenas quando:
- `ci_approved == true`
- `mobile_impacted == true`

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
1. Instala dependências do app mobile (`npm ci`)
2. Gera APK debug (usa `build:android:debug` se existir; fallback para `expo prebuild + gradle`)
3. Executa `gcloud firebase test android run --type robo` com timeout curto (`180s`)

Variáveis úteis:
- `ANDROID_ROBO_TIMEOUT` (default `180s`)
- `ANDROID_ROBO_DEVICE_MODEL` (default `Nexus6`)
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
1. Instala dependências (`npm ci`)
2. Inicializa simulador iOS (default `iPhone 15`)
3. Executa `npm run test:ui:ios:crawler`

Se o script `test:ui:ios:crawler` não existir, o gate falha por design.

## Meta de tempo
- PR gate: smoke com timeout de 3 a 5 minutos por plataforma.
- Cobertura completa: rodar em janela separada (nightly/release) para evitar aumento de lead time do PR.
