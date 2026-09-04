begin;

-- AI approvals: make the approval record append-only except for controlled lifecycle transitions.
create or replace function public.enforce_ai_action_approval_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(),'');
  v_user_role text;
begin
  if v_role = 'service_role' then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select p.role into v_user_role from public.profiles p where p.id = auth.uid();
  if coalesce(v_user_role,'') <> 'admin' then
    raise exception 'Only an admin can change AI approval lifecycle';
  end if;

  if new.id <> old.id
     or new.requested_by <> old.requested_by
     or new.action <> old.action
     or new.request_payload <> old.request_payload
     or new.created_at <> old.created_at then
    raise exception 'AI approval request is immutable';
  end if;

  if new.status = old.status then
    if new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.executed_at is distinct from old.executed_at
       or new.execution_reference is distinct from old.execution_reference then
      raise exception 'Approval metadata cannot be changed without a status transition';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status in ('approved','rejected','cancelled','expired') then
    if new.status = 'approved' then
      new.approved_by := auth.uid();
      new.approved_at := coalesce(new.approved_at, now());
    else
      new.approved_by := coalesce(new.approved_by, auth.uid());
      if new.approved_at is null then new.approved_at := now(); end if;
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'executing' then
    if new.approved_by is null then new.approved_by := old.approved_by; end if;
    if new.approved_at is null then new.approved_at := old.approved_at; end if;
    return new;
  end if;

  if old.status = 'executing' and new.status in ('executed','cancelled') then
    new.executed_at := coalesce(new.executed_at, now());
    return new;
  end if;

  raise exception 'Invalid AI approval status transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists trg_ai_action_approval_lifecycle on public.ai_action_approvals;
create trigger trg_ai_action_approval_lifecycle
before update on public.ai_action_approvals
for each row execute function public.enforce_ai_action_approval_lifecycle();

-- AI workflow versions: authenticated users may author drafts, but cannot self-activate,
-- revoke, or disable a workflow. Admin/service-role can manage lifecycle states.
create or replace function public.enforce_ai_workflow_version_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(),'');
  v_user_role text;
begin
  if v_role = 'service_role' then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select p.role into v_user_role from public.profiles p where p.id = auth.uid();

  if tg_op = 'INSERT' then
    if coalesce(v_user_role,'') <> 'admin' and new.status <> 'draft' then
      raise exception 'Only admin can create a non-draft AI workflow';
    end if;
    if new.user_id <> auth.uid() and coalesce(v_user_role,'') <> 'admin' then
      raise exception 'Workflow owner must be the current user';
    end if;
    if new.confidence < 0 or new.confidence > 1 then
      raise exception 'Confidence must be between 0 and 1';
    end if;
    return new;
  end if;

  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.workflow_key <> old.workflow_key
     or new.version <> old.version
     or new.created_at <> old.created_at then
    raise exception 'AI workflow identity is immutable';
  end if;

  if coalesce(v_user_role,'') = 'admin' then
    return new;
  end if;

  if old.user_id <> auth.uid() then
    raise exception 'Only the workflow owner or admin can modify this workflow';
  end if;

  if old.status <> 'draft' or new.status <> 'draft' then
    raise exception 'Only draft AI workflows can be edited by non-admin users';
  end if;

  if new.activated_at is distinct from old.activated_at
     or new.revoked_at is distinct from old.revoked_at
     or new.revoked_by is distinct from old.revoked_by
     or new.disabled_at is distinct from old.disabled_at
     or new.disabled_by is distinct from old.disabled_by then
    raise exception 'AI workflow lifecycle fields are admin-only';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_workflow_version_lifecycle on public.ai_workflow_versions;
create trigger trg_ai_workflow_version_lifecycle
before insert or update on public.ai_workflow_versions
for each row execute function public.enforce_ai_workflow_version_lifecycle();

-- Ensure approval requests always have an explicit known state.
alter table public.ai_action_approvals alter column status set default 'pending';

commit;
