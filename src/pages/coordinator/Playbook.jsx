import { useState } from 'react';
import { STAGES, SCRIPTS, RULES } from '../../lib/leadSteps';

function Fold({ title, children }) {
  return (
    <details className="group mx-4 mb-3 bg-white border-[1.5px] border-gray-200 rounded-[18px] overflow-hidden">
      <summary className="list-none cursor-pointer min-h-[54px] px-4 py-3.5 font-extrabold text-[17px] flex items-center justify-between [&::-webkit-details-marker]:hidden">
        {title}<span className="text-2xl text-teal-700 group-open:hidden">+</span><span className="text-2xl text-teal-700 hidden group-open:inline">−</span>
      </summary>
      <div className="px-4 pb-4 grid gap-3 text-[15px]">{children}</div>
    </details>
  );
}

export default function Playbook() {
  const [copied, setCopied] = useState(null);
  async function copy(i) {
    try { await navigator.clipboard.writeText(SCRIPTS[i].t); setCopied(i); setTimeout(() => setCopied(null), 2000); }
    catch { setCopied(-1); }
  }
  return (
    <>
      <h2 className="font-extrabold text-base text-gray-500 mx-4 mt-5 mb-2">The 8 stages</h2>
      {STAGES.map((s, i) => (
        <Fold key={s.n} title={`${i + 1}. ${s.n}`}>
          <p><b>Goal:</b> {s.goal}</p>
          <p>{s.exit}</p>
          {s.stop && <p><b className="text-red-700">Stop and escalate:</b> {s.stop}</p>}
          <ul className="space-y-1.5">
            {s.items.map((x) => (
              <li key={x.id}>☐ {x.t}
                {x.opt && <span className="text-gray-400"> (optional)</span>}
                {x.auto && <span className="text-teal-700 text-xs font-bold"> · Auto</span>}
                {x.admin && <span className="text-gray-400 text-xs font-bold"> · Admin ticks</span>}
              </li>
            ))}
          </ul>
        </Fold>
      ))}
      <h2 className="font-extrabold text-base text-gray-500 mx-4 mt-5 mb-2">Message scripts</h2>
      {SCRIPTS.map((s, i) => (
        <Fold key={s.h} title={s.h}>
          <div className="bg-[#f4f7f5] border-[1.5px] border-gray-200 rounded-xl p-3 text-[14.5px] whitespace-pre-wrap">{s.t}</div>
          <button onClick={() => copy(i)} className="h-10 px-3.5 rounded-xl border-[1.5px] border-teal-700 text-teal-700 font-extrabold text-sm w-fit">
            {copied === i ? 'Copied ✓' : copied === -1 ? 'Press and hold the text to copy' : 'Copy message'}
          </button>
        </Fold>
      ))}
      <h2 className="font-extrabold text-base text-gray-500 mx-4 mt-5 mb-2">Rules</h2>
      {RULES.map((r) => <p key={r} className="mx-4 mb-3 p-3.5 bg-amber-50 rounded-[14px] text-sm font-semibold">{r}</p>)}
      <p className="mx-4 mb-3 p-3.5 bg-amber-50 rounded-[14px] text-sm font-semibold">
        WhatsApp buttons only open a chat for you to send. Never send bulk messages.
      </p>
    </>
  );
}
