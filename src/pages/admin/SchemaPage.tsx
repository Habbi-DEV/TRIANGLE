import { useEffect, useState } from 'react';
import { Copy, Database, Download, Radio, ShieldCheck, Table2, Workflow } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
import { useLang } from '../../lib/i18n';

const FACTS = [
  { Icon: Table2, labelKey: 'schema.fact.tables', valueKey: 'schema.fact.tables.value' },
  { Icon: Database, labelKey: 'schema.fact.enums', valueKey: 'schema.fact.enums.value' },
  { Icon: ShieldCheck, labelKey: 'schema.fact.rls', valueKey: 'schema.fact.rls.value' },
  { Icon: Radio, labelKey: 'schema.fact.realtime', valueKey: 'schema.fact.realtime.value' },
  { Icon: Workflow, labelKey: 'schema.fact.triggers', valueKey: 'schema.fact.triggers.value' },
];

export default function SchemaPage() {
  const { t } = useLang();
  const [sql, setSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/schema.sql')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('not found'))))
      .then(setSql)
      .catch(() => setSql('-- schema.sql could not be loaded.'));
  }, []);

  const copy = async () => {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900">{t('schema.title')}</h1>
          <p className="text-sm text-zinc-500">{t('schema.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-50">
            <Copy size={14} /> {copied ? t('schema.copied') : t('schema.copy_sql')}
          </button>
          <a href="/schema.sql" download="schema.sql" className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-brand-600">
            <Download size={14} /> schema.sql
          </a>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {FACTS.map((f) => (
          <div key={f.labelKey} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-zinc-100">
            <f.Icon size={16} className="text-brand-500" />
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t(f.labelKey)}</p>
            <p className="text-xs font-semibold text-zinc-800">{t(f.valueKey)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-zinc-950 shadow-lg ring-1 ring-zinc-800">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
          <span className="ms-2 font-mono text-[11px] text-zinc-500">schema.sql · PostgreSQL / Supabase</span>
        </div>
        {sql === null ? (
          <div className="bg-white"><Spinner label={t('schema.loading')} /></div>
        ) : (
          <pre dir="ltr" className="thin-scroll max-h-[65vh] overflow-auto p-5 text-start font-mono text-[11.5px] leading-relaxed text-orange-100/90">
            {sql}
          </pre>
        )}
      </div>
    </div>
  );
}
