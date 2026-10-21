'use client';

import { useState, useTransition } from 'react';
import { planToggle, unmetRequirements, type ModuleStates, type TogglePlan } from '@/lib/modules/logic';
import type { ModuleMeta } from '@/lib/modules/types';
import { toggleModule } from './actions';

interface Props {
  metas: ModuleMeta[];
  initialChosen: ModuleStates;
  initialEffective: ModuleStates;
}

function names(ids: string[], metas: ModuleMeta[]): string {
  const labels = ids.map((id) => metas.find((m) => m.id === id)?.label ?? id);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function requirementText(meta: ModuleMeta, metas: ModuleMeta[]): string | null {
  if (meta.requires.length === 0) return null;
  const parts = meta.requires.map((clause) =>
    clause.map((id) => metas.find((m) => m.id === id)?.label ?? id).join(' or '),
  );
  return `Needs ${parts.join(' and ')}.`;
}

export function ModulesBoard({ metas, initialChosen, initialEffective }: Props) {
  const [chosen, setChosen] = useState(initialChosen);
  const [effective, setEffective] = useState(initialEffective);
  const [pendingPlan, setPendingPlan] = useState<TogglePlan | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; tone: 'ok' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  function commit(plan: TogglePlan, cascade: boolean) {
    setPendingPlan(null);
    startTransition(async () => {
      const result = await toggleModule({ id: plan.id, on: plan.on, cascade });
      if (result.ok) {
        setChosen(result.chosen);
        setEffective(result.effective);
        const label = metas.find((m) => m.id === plan.id)?.label ?? plan.id;
        setMessage({ id: plan.id, text: `${label} is ${plan.on ? 'on' : 'off'}. Saved.`, tone: 'ok' });
      } else {
        setMessage({ id: plan.id, text: result.message, tone: 'error' });
      }
    });
  }

  function onSwitch(meta: ModuleMeta) {
    const next = !chosen[meta.id];
    const plan = planToggle(metas, chosen, meta.id, next);
    if (plan.alsoOn.length > 0 || plan.alsoOff.length > 0) setPendingPlan(plan);
    else commit(plan, false);
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2">
      {metas.map((meta) => {
        const isChosen = chosen[meta.id] === true;
        const isLive = effective[meta.id] === true;
        const waiting = isChosen && !isLive ? unmetRequirements(meta, effective).map((c) => c[0] as string) : [];
        const needs = requirementText(meta, metas);
        const switchId = `module-${meta.id}`;
        const plan = pendingPlan?.id === meta.id ? pendingPlan : null;
        return (
          <li key={meta.id} className="flex flex-col rounded-card border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`${switchId}-label`} className="font-display text-base font-semibold text-ink">
                  {meta.label}
                </h2>
                <p className="mt-1 text-sm">{meta.description}</p>
              </div>
              <button
                id={switchId}
                type="button"
                role="switch"
                aria-checked={isChosen}
                aria-labelledby={`${switchId}-label`}
                disabled={meta.alwaysOn || isPending}
                onClick={() => onSwitch(meta)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line transition-colors disabled:opacity-60 ${
                  isChosen ? 'bg-primary' : 'bg-raised'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 rounded-full bg-surface transition-transform ${
                    isChosen ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {meta.alwaysOn ? <p className="mt-3 text-xs text-muted">Always on.</p> : null}
            {needs ? <p className="mt-3 text-xs text-muted">{needs}</p> : null}
            {waiting.length > 0 ? (
              <p className="mt-2 text-sm text-warning">
                Switched on, but not live until {names(waiting, metas)} {waiting.length > 1 ? 'are' : 'is'} on.
              </p>
            ) : null}
            {plan ? (
              <div className="mt-4 rounded-input border border-line bg-raised p-3 text-sm" role="group" aria-label="Confirm change">
                <p className="text-ink">
                  {plan.on
                    ? `${meta.label} needs ${names(plan.alsoOn, metas)}. Switch ${plan.alsoOn.length > 1 ? 'them' : 'it'} on too?`
                    : `${names(plan.alsoOff, metas)} ${plan.alsoOff.length > 1 ? 'depend' : 'depends'} on ${meta.label} and will stop working. Switch ${plan.alsoOff.length > 1 ? 'them' : 'it'} off too?`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => commit(plan, true)}
                    className="min-h-10 rounded-button bg-primary px-3 font-medium text-primary-ink"
                  >
                    {plan.on ? 'Switch all on' : 'Switch all off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(plan, false)}
                    className="min-h-10 rounded-button border border-line px-3 text-ink"
                  >
                    Only {meta.label}
                  </button>
                  <button type="button" onClick={() => setPendingPlan(null)} className="min-h-10 px-3 text-muted">
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {message?.id === meta.id ? (
              <p role="status" className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-success' : 'text-danger'}`}>
                {message.text}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
