import { Sparkles } from 'lucide-react';

type AiHandoffSummaryProps = {
  summary: string;
};

export default function AiHandoffSummary({ summary }: AiHandoffSummaryProps) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
      aria-label="AI handoff summary"
    >
      <div className="flex items-center gap-2 text-blue-600">
        <Sparkles size={14} />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em]">
          AI Handoff Summary
        </h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{summary}</p>
    </section>
  );
}
