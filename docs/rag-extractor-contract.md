# FastRoute KB Extractor Contract (Supabase -> Vector Store)

## Objetivo
Garantir sincronizacao incremental, barata e idempotente das data-tables para a base vetorial usada pelo fluxo RAG.

## Arquitetura recomendada (menor custo)
1. Fonte de verdade: tabelas relacionais.
2. Outbox transacional: `kb_outbox`.
3. Extractor incremental: Edge Function ou worker cron lendo `kb_outbox`.
4. Vector store: `kb_chunks` (pgvector no proprio Supabase).
5. RAG: consulta vetorial + filtros por metadados (`analysis_id`, `repo_name`, `kind`).

## Contrato do extractor

### Entrada
- Batch de eventos pendentes em `kb_outbox`:
  - `id`, `source_table`, `source_pk`, `operation`, `payload`.

### Processo
1. Claim de lote com lock (`for update skip locked`).
2. Para cada evento, buscar documento em `kb_document_candidates` por (`source_table`, `source_pk`).
3. Se `operation = DELETE`:
   - marcar `kb_documents.is_active=false` para (`source_table`, `source_pk`);
   - remover `kb_chunks` desse documento (ou manter para auditoria, conforme politica).
4. Se `INSERT/UPDATE`:
   - comparar `content_hash` com `kb_documents.content_hash`.
   - se hash igual: apenas `processed_at` no outbox.
   - se hash mudou:
     - upsert em `kb_documents`.
     - rechunk (ex: 1000-1400 chars, overlap 150-200).
     - gerar embeddings dos chunks.
     - substituir chunks antigos do documento em `kb_chunks`.
5. Marcar evento como processado:
   - `processed_at=now()` e `attempts=attempts+1`.
6. Em erro:
   - `attempts=attempts+1`, `last_error`, `next_retry_at` com backoff exponencial.

### Saida
- `kb_documents` atualizado.
- `kb_chunks` atualizado com embeddings.
- `kb_outbox` processado ou agendado para retry.

## API operacional (sugestao)

### POST /kb/sync
Dispara processamento manual (n8n pode chamar apos execucao bem-sucedida).

Request:
```json
{
  "batch_size": 200,
  "max_attempts": 8,
  "analysis_id": 123,
  "source_tables": ["impact_analysis", "changes_in_repo", "code_changes", "testsuites_for_change", "tests_for_testsuite"]
}
```

Response:
```json
{
  "status": "ok",
  "claimed": 120,
  "processed": 114,
  "skipped_same_hash": 5,
  "failed": 1,
  "duration_ms": 8420
}
```

### GET /kb/health
Response:
```json
{
  "pending_events": 42,
  "stuck_locks": 0,
  "last_processed_at": "2026-03-09T12:15:00Z"
}
```

## Query de claim (referencia)
```sql
with cte as (
  select id
  from public.kb_outbox
  where processed_at is null
    and (next_retry_at is null or next_retry_at <= now())
    and (locked_at is null or locked_at < now() - interval '10 minutes')
  order by id
  limit 200
  for update skip locked
)
update public.kb_outbox o
set locked_at = now(), lock_owner = 'kb-sync-worker-1'
where o.id in (select id from cte)
returning o.*;
```

## Regras de custo
- Nunca re-embedar quando `content_hash` nao mudou.
- Deduplicar por `source_table + source_pk + content_hash`.
- Preferir pgvector no Supabase para evitar custo extra de infra e egress.
- Separar modelo de embedding do modelo gerador do RAG.

## Integracao com n8n (pos sucesso)
- No fim do fluxo de impact analysis, chamar `/kb/sync` com `analysis_id`.
- Sem depender de reprocessamento total.
- Se falhar, registrar erro e manter retry no worker (nao quebrar pipeline principal).

## Checklist de producao
- [ ] Secret de embedding provider configurado.
- [ ] Politica de retry e DLQ definida.
- [ ] Monitor de backlog (`pending_events`) com alerta.
- [ ] Job de vacuum/analyze para tabela de chunks.
- [ ] Controle de acesso RLS em `kb_documents`/`kb_chunks` conforme tenant.
