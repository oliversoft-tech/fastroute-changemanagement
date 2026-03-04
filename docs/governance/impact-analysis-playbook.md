# FastRoute - Playbook de Impacto e Viabilidade

## Objetivo
Antes de iniciar qualquer implementação, toda demanda deve passar por análise de impacto técnico e viabilidade.

## Entradas obrigatórias
- Texto da solicitação em linguagem natural
- Critérios de aceite
- Restrições conhecidas

## Repositórios-alvo
- `fastroute-domain`: regras de negócio, invariantes, validações e transições de estado.
- `fastroute-api`: contratos HTTP, autorização, persistência, sync server-side e deploy VPS.
- `fastroute-mobile-hybrid`: UX mobile, offline-first local, sync client, builds Android/iOS.

## Matriz de impacto (preencher por demanda)
| Área | Impacto | Evidência |
|---|---|---|
| fastroute-domain | Sim/Não | Funções/regras alteradas |
| fastroute-api | Sim/Não | Endpoints/tabelas/serviços alterados |
| fastroute-mobile-hybrid | Sim/Não | Telas/fluxos/sync local alterados |
| Infra (VPS/Nginx/Cloudflare/GHCR) | Sim/Não | Novo recurso/configuração |
| Integrações externas (Supabase/n8n/geocoding/maps/stores) | Sim/Não | Contrato/credencial/limite novo |

## Viabilidade
Classificar como `Alta`, `Média` ou `Baixa` com justificativa objetiva:
- Complexidade de código
- Dependências externas
- Risco operacional
- Necessidade de migração/rollback

## Gate de execução
Uma mudança só entra em desenvolvimento quando existir:
1. CR aberta com escopo claro.
2. Matriz de impacto preenchida.
3. Viabilidade classificada e aprovada.
