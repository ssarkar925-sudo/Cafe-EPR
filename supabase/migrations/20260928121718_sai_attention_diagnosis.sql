alter table public.sai_attention
  add column if not exists diagnosis_category text,
  add column if not exists diagnosis_explanation text,
  add column if not exists recommended_action text,
  add column if not exists auto_recovery_allowed boolean not null default false,
  add column if not exists diagnosis_status text not null default 'pending'
    check (diagnosis_status in ('pending','diagnosed','recovery_ready','resolved'));

create index if not exists sai_attention_diagnosis_idx
  on public.sai_attention(business_id, status, diagnosis_status, created_at desc);
