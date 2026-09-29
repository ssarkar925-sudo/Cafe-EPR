alter table public.sai_evidence_links
  drop constraint if exists sai_evidence_links_subject_type_check;

alter table public.sai_evidence_links
  add constraint sai_evidence_links_subject_type_check
  check (subject_type in (
    'event',
    'plan',
    'goal',
    'mission',
    'command',
    'command_step',
    'command_result',
    'verification',
    'attention',
    'evidence'
  ));
