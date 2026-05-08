// frontend/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import { useApp } from '../context/AppContext';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>{title}</div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { saveSettings, settings: ctxSettings } = useApp();
  const [form, setForm] = useState<Record<string,string>>({});
  const [saved, setSaved] = useState(false);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [msgTemplates, setMsgTemplates] = useState<any[]>([]);
  const [tab, setTab] = useState<'general'|'invoicing'|'tax'|'checklists'|'messages'|'automation'>('general');
  const [newTpl, setNewTpl] = useState({ situation: '', subject: '', content: '' });
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    settingsApi.get().then(s => setForm(s));
    settingsApi.getChecklists().then(setChecklists);
    settingsApi.getMsgTemplates().then(setMsgTemplates);
  }, []);

  const save = async () => {
    await saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveChecklist = async (cl: any, items: string[]) => {
    await settingsApi.saveChecklist(cl.id, { items });
    settingsApi.getChecklists().then(setChecklists);
  };

  const saveMsgTemplate = async (tpl: any, content: string) => {
    await settingsApi.saveMsgTemplate(tpl.id, { content });
    settingsApi.getMsgTemplates().then(setMsgTemplates);
  };

  const createMsgTemplate = async () => {
    if (!newTpl.situation.trim() || !newTpl.content.trim()) return;
    setTplSaving(true);
    await settingsApi.createMsgTemplate(newTpl);
    settingsApi.getMsgTemplates().then(setMsgTemplates);
    setNewTpl({ situation: '', subject: '', content: '' });
    setShowNewTpl(false);
    setTplSaving(false);
  };

  const deleteMsgTemplate = async (id: number) => {
    if (!confirm('Smazat tuto šablonu?')) return;
    await settingsApi.deleteMsgTemplate(id);
    settingsApi.getMsgTemplates().then(setMsgTemplates);
  };

  const PLACEHOLDERS = ['{jméno}', '{zařízení}', '{číslo}', '{cena}', '{telefon}', '{termín}', '{číslo_účtu}', '{číslo_faktury}', '{splatnost}'];

  const TabB = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '8px 16px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--rule)',
      background: tab===id ? 'var(--navy)' : 'var(--white)',
      color: tab===id ? '#fff' : 'var(--muted)',
      fontWeight: 600, fontSize: 13, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Nastavení</div><div className="page-subtitle">Konfigurace celého systému ZdeVer OS</div></div>
        {tab !== 'checklists' && tab !== 'messages' && (
          <button className="btn btn-primary" onClick={save}>
            {saved ? '✅ Uloženo!' : '💾 Uložit nastavení'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabB id="general" label="⚙️ Obecné" />
        <TabB id="invoicing" label="🧾 Fakturace & platby" />
        <TabB id="tax" label="🧮 Daně & kalkulačka" />
        <TabB id="checklists" label="✅ Checklisty" />
        <TabB id="messages" label="💬 Šablony zpráv" />
        <TabB id="automation" label="🔗 Automatizace" />
      </div>

      {/* ── General ──────────────────────────────────────────────── */}
      {tab === 'general' && (
        <>
          <Section title="🎨 Vzhled">
            <div className="form-group">
              <label className="form-label">Barevné téma</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {['light','dark'].map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="theme" value={t} checked={form.theme===t}
                      onChange={() => set('theme', t)} />
                    {t === 'light' ? '☀️ Světlé' : '🌙 Tmavé'}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="🏢 Firemní údaje">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Název firmy / jméno</label>
                <input className="form-input" value={form.company_name||''} onChange={e => set('company_name',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">IČO</label>
                <input className="form-input" value={form.company_ico||''} onChange={e => set('company_ico',e.target.value)} placeholder="Doplnit po získání živnosti" /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">DIČ</label>
                <input className="form-input" value={form.company_dic||''} onChange={e => set('company_dic',e.target.value)} placeholder="CZ12345678 (pouze pro plátce DPH)" />
                <div className="form-hint">Zobrazí se na dokumentech pouze pokud jste plátce DPH</div>
              </div>
              <div className="form-group">
                <label className="form-label">Registrace (rejstřík)</label>
                <input className="form-input" value={form.company_registry||''} onChange={e => set('company_registry',e.target.value)} placeholder="Živnostenský rejstřík, MěÚ Nový Jičín" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Adresa</label>
                <input className="form-input" value={form.company_address||''} onChange={e => set('company_address',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Město / kraj</label>
                <input className="form-input" value={form.company_city||''} onChange={e => set('company_city',e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Telefon</label>
                <input className="form-input" value={form.company_phone||''} onChange={e => set('company_phone',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">E-mail</label>
                <input className="form-input" type="email" value={form.company_email||''} onChange={e => set('company_email',e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Web</label>
                <input className="form-input" value={form.company_web||''} onChange={e => set('company_web',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Jméno technika</label>
                <input className="form-input" value={form.technician_name||''} onChange={e => set('technician_name',e.target.value)} /></div>
            </div>
          </Section>

          <Section title="💶 Měna a DPH">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Měna</label>
                <select className="form-select" value={form.currency||'Kč'} onChange={e => set('currency',e.target.value)}>
                  <option value="Kč">Kč (česká koruna)</option>
                  <option value="€">€ (euro)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Plátce DPH</label>
                <select className="form-select" value={form.vat_payer||'false'} onChange={e => set('vat_payer',e.target.value)}>
                  <option value="false">Ne (neplátce DPH)</option>
                  <option value="true">Ano (plátce DPH)</option>
                </select>
              </div>
            </div>
            {form.vat_payer === 'true' && (
              <div className="form-row">
                <div className="form-group"><label className="form-label">Sazba DPH (%)</label>
                  <input className="form-input" type="number" value={form.vat_rate||'21'} onChange={e => set('vat_rate',e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-hint">OSVČ student na vedlejší činnost — standardně nejste plátce DPH (§ 6 z. č. 235/2004 Sb.)</div>
          </Section>
        </>
      )}

      {/* ── Invoicing ────────────────────────────────────────────── */}
      {tab === 'invoicing' && (
        <>
          <Section title="🏦 Bankovní účet & QR platby">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Číslo účtu</label>
                <input className="form-input" value={form.bank_account||''} onChange={e => set('bank_account',e.target.value)} placeholder="123456789/0800" /></div>
              <div className="form-group"><label className="form-label">Kód banky</label>
                <input className="form-input" value={form.bank_code||''} onChange={e => set('bank_code',e.target.value)} placeholder="0800" /></div>
            </div>
            <div className="form-group">
              <label className="form-label">QR platba na dokladech</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {[['true','✅ Zobrazovat QR kód'],['false','❌ Nezobrazovat']].map(([v,l]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="qr" value={v} checked={form.qr_payment_enabled===v}
                      onChange={() => set('qr_payment_enabled',v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="🧾 Číslování dokladů">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Prefix dokladů</label>
                <input className="form-input" value={form.invoice_prefix||''} onChange={e => set('invoice_prefix',e.target.value)} placeholder="2025" /></div>
              <div className="form-group"><label className="form-label">Výchozí záruka (dny)</label>
                <input className="form-input" type="number" value={form.warranty_days||'30'} onChange={e => set('warranty_days',e.target.value)} /></div>
            </div>
          </Section>

          <Section title="📦 Sklad & marže">
            <div className="form-group"><label className="form-label">Výchozí marže na díly (%)</label>
              <input className="form-input" type="number" value={form.default_margin||'20'} onChange={e => set('default_margin',e.target.value)} />
              <div className="form-hint">Použito jako výchozí hodnota při přidávání nových dílů a kalkulaci.</div>
            </div>
          </Section>

          <button className="btn btn-primary" onClick={save}>{saved ? '✅ Uloženo!' : '💾 Uložit nastavení'}</button>
        </>
      )}

      {/* ── Tax / Daně ───────────────────────────────────────────── */}
      {tab === 'tax' && (
        <>
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            Tato nastavení ovlivňují daňovou kalkulačku v Účetnictví a orientační daňový odhad v přehledu.
            Hodnoty vychází z platné legislativy ČR — měňte jen pokud se pravidla změní nebo máte jiný typ podnikání.
          </div>

          <Section title="📊 Typ podnikání a paušál">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Typ činnosti OSVČ</label>
                <select className="form-select" value={form.tax_employment_type||'side'} onChange={e => set('tax_employment_type',e.target.value)}>
                  <option value="side">Vedlejší činnost (student, zaměstnanec…)</option>
                  <option value="main">Hlavní činnost</option>
                </select>
                <div className="form-hint">Vedlejší činnost = nižší sociální pojistné a vyšší práh pro povinnost platit</div>
              </div>
              <div className="form-group">
                <label className="form-label">Paušální výdaje (%)</label>
                <input className="form-input" type="number" value={form.tax_flat_expense_rate||'60'} onChange={e => set('tax_flat_expense_rate',e.target.value)} />
                <div className="form-hint">Řemeslná živnost = 80 %, ostatní volné živnosti = 60 %</div>
              </div>
            </div>
          </Section>

          <Section title="💰 Daňové sazby a slevy">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sazba daně z příjmu (%)</label>
                <input className="form-input" type="number" value={form.tax_income_rate||'15'} onChange={e => set('tax_income_rate',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Sleva na poplatníka (Kč/rok)</label>
                <input className="form-input" type="number" value={form.tax_taxpayer_relief||'30840'} onChange={e => set('tax_taxpayer_relief',e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="🏥 Pojistné">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sazba sociálního pojistného (%)</label>
                <input className="form-input" type="number" step="0.1" value={form.tax_social_rate||'29.2'} onChange={e => set('tax_social_rate',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Rozhodná částka — soc. poj. (Kč/rok)</label>
                <input className="form-input" type="number" value={form.tax_social_threshold||'111736'} onChange={e => set('tax_social_threshold',e.target.value)} />
                <div className="form-hint">Vedlejší činnost: soc. pojistné platíte jen nad touto hranicí</div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sazba zdravotního pojistného (%)</label>
                <input className="form-input" type="number" step="0.1" value={form.tax_health_rate||'13.5'} onChange={e => set('tax_health_rate',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Min. základ zdravotního poj. (Kč)</label>
                <input className="form-input" type="number" value={form.tax_health_min_base||'13500'} onChange={e => set('tax_health_min_base',e.target.value)} />
              </div>
            </div>
          </Section>

          <button className="btn btn-primary" onClick={save}>{saved ? '✅ Uloženo!' : '💾 Uložit nastavení'}</button>
        </>
      )}

      {/* ── Checklists ───────────────────────────────────────────── */}
      {tab === 'checklists' && (
        <>
          {checklists.map(cl => {
            const items: string[] = JSON.parse(cl.items);
            return (
              <Section key={cl.id} title={`✅ ${cl.name}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input className="form-input" value={item}
                        onChange={e => {
                          const ni = [...items]; ni[i] = e.target.value;
                          setChecklists(c => c.map(x => x.id===cl.id ? {...x,items:JSON.stringify(ni)} : x));
                        }} />
                      <button className="btn btn-danger btn-sm btn-icon"
                        onClick={() => {
                          const ni = items.filter((_,j)=>j!==i);
                          setChecklists(c => c.map(x => x.id===cl.id ? {...x,items:JSON.stringify(ni)} : x));
                        }}>🗑️</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    const ni = [...items, 'Nová položka'];
                    setChecklists(c => c.map(x => x.id===cl.id ? {...x,items:JSON.stringify(ni)} : x));
                  }}>+ Přidat položku</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveChecklist(cl, JSON.parse(cl.items))}>💾 Uložit</button>
                </div>
              </Section>
            );
          })}
        </>
      )}

      {tab === 'automation' && (
        <>
          <Section title="🔁 Review & marketing">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Auto review request při vydání</label>
                <select className="form-input" value={form.auto_review_request||'false'} onChange={e => set('auto_review_request', e.target.value)}>
                  <option value="false">Vypnuto (manuálně)</option>
                  <option value="true">Zapnuto (automaticky)</option>
                </select>
                <div className="form-hint">Přidá poznámku do zakázky při přechodu na „Vydáno". Základ pro budoucí SMS/email notifikace.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Prodleva review requestu (hodiny)</label>
                <input className="form-input" type="number" value={form.review_request_delay_hours||'24'} onChange={e => set('review_request_delay_hours', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="🛡️ Záruční notifikace">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Auto notifikace před koncem záruky</label>
                <select className="form-input" value={form.warranty_auto_notify||'false'} onChange={e => set('warranty_auto_notify', e.target.value)}>
                  <option value="false">Vypnuto</option>
                  <option value="true">Zapnuto</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Dní před koncem záruky</label>
                <input className="form-input" type="number" value={form.warranty_notify_days_before||'7'} onChange={e => set('warranty_notify_days_before', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Follow-up po vypršení záruky</label>
                <select className="form-input" value={form.warranty_followup_enabled||'false'} onChange={e => set('warranty_followup_enabled', e.target.value)}>
                  <option value="false">Vypnuto</option>
                  <option value="true">Zapnuto</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Dní po vypršení (follow-up)</label>
                <input className="form-input" type="number" value={form.warranty_followup_days||'7'} onChange={e => set('warranty_followup_days', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="👥 Zákazníci & technici">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Neaktivní zákazník po (dnech)</label>
                <input className="form-input" type="number" value={form.customer_inactive_threshold_days||'180'} onChange={e => set('customer_inactive_threshold_days', e.target.value)} />
                <div className="form-hint">Zákazníci bez zakázky déle než X dní jsou označeni jako neaktivní.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Výchozí technik (username)</label>
                <input className="form-input" value={form.default_technician_id||''} onChange={e => set('default_technician_id', e.target.value)} placeholder="Prázdné = bez předvyplnění" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Období výkonu techniků</label>
                <select className="form-input" value={form.employee_performance_period||'month'} onChange={e => set('employee_performance_period', e.target.value)}>
                  <option value="month">Měsíc</option>
                  <option value="quarter">Kvartál</option>
                  <option value="year">Rok</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alerty nízkých zásob na Dashboardu</label>
                <select className="form-input" value={form.low_stock_dashboard_alerts||'true'} onChange={e => set('low_stock_dashboard_alerts', e.target.value)}>
                  <option value="true">Zapnuto</option>
                  <option value="false">Vypnuto</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="🚗 Výjezdní zóny (přesunuty z kódu do DB)">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Zóna 1 — do (km)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone1_km||'5'} onChange={e => set('visit_fee_zone1_km', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Zóna 1 — poplatek (Kč)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone1_czk||'0'} onChange={e => set('visit_fee_zone1_czk', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Zóna 2 — do (km)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone2_km||'15'} onChange={e => set('visit_fee_zone2_km', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Zóna 2 — poplatek (Kč)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone2_czk||'150'} onChange={e => set('visit_fee_zone2_czk', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Zóna 3 — do (km)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone3_km||'30'} onChange={e => set('visit_fee_zone3_km', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Zóna 3 — poplatek (Kč)</label>
                <input className="form-input" type="number" value={form.visit_fee_zone3_czk||'300'} onChange={e => set('visit_fee_zone3_czk', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Nad zónu 3 — sazba (Kč/km)</label>
                <input className="form-input" type="number" value={form.visit_fee_over_czk_per_km||'15'} onChange={e => set('visit_fee_over_czk_per_km', e.target.value)} />
                <div className="form-hint">Poplatek = Zóna3_Kč + (vzdálenost − Zóna3_km) × sazba</div>
              </div>
            </div>
          </Section>

          <button className="btn btn-primary" onClick={save}>{saved ? '✅ Uloženo!' : '💾 Uložit automatizaci'}</button>
        </>
      )}

      {/* ── Message templates ────────────────────────────────────── */}
      {tab === 'messages' && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="form-hint">
              Dostupné placeholdery: {PLACEHOLDERS.map(p => <code key={p} style={{ background: 'var(--light)', padding: '1px 5px', borderRadius: 3, marginRight: 4, fontSize: 11 }}>{p}</code>)}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewTpl(t => !t)}>
              {showNewTpl ? '✕ Zrušit' : '+ Nová šablona'}
            </button>
          </div>

          {/* Formulář nové šablony */}
          {showNewTpl && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Nová vlastní šablona</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Situace / název *</label>
                  <input className="form-input" placeholder="např. Zákazník nepřišel" value={newTpl.situation}
                    onChange={e => setNewTpl(n => ({ ...n, situation: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Předmět (volitelné)</label>
                  <input className="form-input" placeholder="Předmět zprávy" value={newTpl.subject}
                    onChange={e => setNewTpl(n => ({ ...n, subject: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Text zprávy *</label>
                <textarea className="form-textarea" rows={5}
                  placeholder="Dobrý den {jméno}, …"
                  value={newTpl.content}
                  onChange={e => setNewTpl(n => ({ ...n, content: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={createMsgTemplate} disabled={tplSaving}>
                {tplSaving ? <div className="spinner" /> : '💾 Vytvořit šablonu'}
              </button>
            </div>
          )}

          {msgTemplates.map(tpl => (
            <Section key={tpl.id} title={`💬 ${tpl.situation}${tpl.is_custom ? ' 🏷️ vlastní' : ''}`}>
              {tpl.subject && (
                <div className="form-group">
                  <label className="form-label">Předmět</label>
                  <input className="form-input" value={tpl.subject || ''}
                    onChange={e => setMsgTemplates(t => t.map(x => x.id===tpl.id ? {...x, subject: e.target.value} : x))} />
                </div>
              )}
              <textarea className="form-textarea" rows={6} value={tpl.content}
                onChange={e => setMsgTemplates(t => t.map(x => x.id===tpl.id ? {...x,content:e.target.value} : x))} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm"
                  onClick={() => saveMsgTemplate(tpl, tpl.content)}>💾 Uložit</button>
                {tpl.is_custom && (
                  <button className="btn btn-danger btn-sm"
                    onClick={() => deleteMsgTemplate(tpl.id)}>🗑️ Smazat</button>
                )}
              </div>
            </Section>
          ))}
        </>
      )}
    </div>
  );
}