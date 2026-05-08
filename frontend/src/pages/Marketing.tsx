// frontend/src/pages/Marketing.tsx — C-08 Marketing Suite
import { useEffect, useState } from 'react';
import { marketingApi, ordersApi } from '../api';
import { useApp } from '../context/AppContext';

const SOURCES = ['Facebook', 'Bazoš', 'Google', 'Doporučení', 'Letáček', 'Jiné'];
const PLATFORMS = ['facebook', 'bazos', 'jiné'];
const DEFAULT_ADS = [
  {
    name: 'Facebook — opravy PC/NTB',
    platform: 'facebook',
    content: `🔧 Opravím váš {služba} rychle a za férovú cenu!\n\n✅ Diagnostika ZDARMA\n✅ Cena předem, bez překvapení\n✅ 30 dní záruka na práci\n\n📍 {lokalita} a okolí\n📞 {telefon}\n\nCeny od {cena_od} Kč. Napište zprávu nebo zavolejte! 👇`,
  },
  {
    name: 'Bazoš — opravy telefonu',
    platform: 'bazos',
    content: `Oprava telefonu/tabletu — {lokalita}\n\nOpravuji displeje, baterie, nabíjecí porty a další.\nDiagnostika zdarma.\nCeny od {cena_od} Kč + díly.\n\nTel: {telefon}`,
  },
];

// Inline SVG koláčový graf (bez externích deps, stejný styl jako Analytics)
function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (!data.length || data.every(d => d.value === 0)) {
    return <div style={{ color:'var(--muted)', fontSize:13, padding:16 }}>Žádná data</div>;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 70, cx = 90, cy = 90;
  let angle = -Math.PI / 2;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
      <svg width={180} height={180}>
        {data.map((d, i) => {
          const slice = (d.value / total) * 2 * Math.PI;
          const x1 = cx + R * Math.cos(angle);
          const y1 = cy + R * Math.sin(angle);
          const x2 = cx + R * Math.cos(angle + slice);
          const y2 = cy + R * Math.sin(angle + slice);
          const large = slice > Math.PI ? 1 : 0;
          const path = `M${cx},${cy} L${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} Z`;
          angle += slice;
          return <path key={i} d={path} fill={d.color} stroke="var(--white)" strokeWidth={2} />;
        })}
        <circle cx={cx} cy={cy} r={36} fill="var(--white)" />
        <text x={cx} y={cy-5} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--navy)">{total}</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize={9} fill="var(--muted)">zakázek</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:d.color, flexShrink:0 }} />
            <span>{d.label}</span>
            <span style={{ fontWeight:700, marginLeft:'auto', paddingLeft:12 }}>{d.value}</span>
            <span style={{ color:'var(--muted)', fontSize:11 }}>({Math.round(d.value/total*100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PIE_COLORS = ['#4A7CC7','#0a6a55','#f59e0b','#e11d48','#8b5cf6','#64748b'];

function renderTemplate(content: string, vars: Record<string,string>) {
  return content.replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
}

// ─── Hlavní stránka ───────────────────────────────────────────────────────────
export default function Marketing() {
  const [tab, setTab] = useState<'sources' | 'ads' | 'review' | 'newsletter' | 'segments'>('sources');
  const [sources, setSources] = useState<any[]>([]);
  const [adTemplates, setAdTemplates] = useState<any[]>([]);
  const [editAd, setEditAd] = useState<any>(null);
  const [newAdOpen, setNewAdOpen] = useState(false);
  const [newAd, setNewAd] = useState({ name:'', platform:'facebook', content:'' });
  const [loading, setLoading] = useState(true);

  // Review
  const [reviewOrderId, setReviewOrderId] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  // Ad vars
  const { settings } = useApp();
  // Marketing → Nastavení: auto-load company dat
  const [adVars, setAdVars] = useState({
    služba: 'PC/notebook',
    cena_od: '299',
    telefon: '',
    lokalita: 'Višňové',
  });

  useEffect(() => {
    setAdVars(prev => ({
      ...prev,
      telefon: prev.telefon || settings.company_phone || '',
      lokalita: prev.lokalita || settings.company_city || settings.company_address || 'Višňové',
    }));
  }, [settings.company_phone, settings.company_city]);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Newsletter
  const [newsletter, setNewsletter] = useState('Dobrý den!\n\nVáš ZdeVer Repair přichází s novinkami...\n\nZdeněk');

  async function load() {
    setLoading(true);
    try {
      const [src, ads] = await Promise.all([marketingApi.sources(), marketingApi.adTemplates()]);
      setSources(src.data || []);
      setAdTemplates(ads.data || []);
      if ((ads.data||[]).length === 0) {
        // seed default templates
        for (const t of DEFAULT_ADS) {
          await marketingApi.createAd(t);
        }
        const r2 = await marketingApi.adTemplates();
        setAdTemplates(r2.data || []);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveAd() {
    if (!editAd) return;
    await marketingApi.updateAd(editAd.id, { name:editAd.name, platform:editAd.platform, content:editAd.content });
    setEditAd(null);
    load();
  }

  async function createAd() {
    if (!newAd.name || !newAd.content) return;
    await marketingApi.createAd(newAd);
    setNewAdOpen(false);
    setNewAd({ name:'', platform:'facebook', content:'' });
    load();
  }

  async function deleteAd(id: number) {
    if (!confirm('Smazat šablonu inzerátu?')) return;
    await marketingApi.deleteAd(id);
    load();
  }

  async function genReview() {
    const id = parseInt(reviewOrderId);
    if (!id) return;
    setReviewLoading(true);
    try {
      const r = await marketingApi.reviewRequest(id);
      setReviewMsg(r.message);
    } catch (e: any) {
      setReviewMsg('Zakázka nenalezena nebo chyba serveru.');
    }
    setReviewLoading(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key:'sources',    label:'📊 Zdroje zákazníků' },
    { key:'ads',        label:'📝 Šablony inzerátů' },
    { key:'review',     label:'⭐ Sběr recenzí' },
    { key:'newsletter', label:'📧 Newsletter' },
    { key:'segments',   label:'👥 Segmenty' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Marketing Suite</div>
          <div className="page-subtitle">C-08 — zdroje zákazníků, inzeráty, recenze, newsletter</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'2px solid var(--rule)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'10px 18px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontWeight:600,
            color: tab===t.key ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tab===t.key ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Zdroje zákazníků ── */}
      {tab === 'sources' && (
        <div>
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:20 }}>Odkud přicházejí zákazníci</h3>
            {loading ? (
              <div className="spinner" />
            ) : sources.length === 0 ? (
              <div style={{ color:'var(--muted)', fontSize:13 }}>
                Žádná data. Přidávejte zdroj při vytváření zakázky (pole "Odkud zákazník přišel").
              </div>
            ) : (
              <PieChart data={sources.map((s, i) => ({
                label: s.source,
                value: s.count,
                color: PIE_COLORS[i % PIE_COLORS.length],
              }))} />
            )}
          </div>
          <div className="card" style={{ marginTop:16, padding:'0' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--rule)', fontWeight:700, fontSize:13 }}>
              Přehled zdrojů
            </div>
            <table className="table">
              <thead><tr><th>Zdroj</th><th>Zakázky</th><th>%</th></tr></thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign:'center', color:'var(--muted)', padding:20 }}>Žádná data</td></tr>
                ) : sources.map((s, i) => {
                  const total = sources.reduce((a,b) => a+b.count, 0);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{s.source}</td>
                      <td>{s.count}</td>
                      <td>{Math.round(s.count/total*100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Šablony inzerátů ── */}
      {tab === 'ads' && (
        <div>
          {/* Proměnné */}
          <div className="card" style={{ padding:20, marginBottom:16 }}>
            <h3 style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Proměnné pro inzeráty</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
              {Object.entries(adVars).map(([k, v]) => (
                <div key={k} className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">{`{${k}}`}</label>
                  <input className="form-input" value={v}
                    onChange={e => setAdVars(prev => ({ ...prev, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Šablony */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {adTemplates.map(ad => (
              <div key={ad.id} className="card" style={{ padding:20 }}>
                {editAd?.id === ad.id ? (
                  <div>
                    <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                      <input className="form-input" value={editAd.name}
                        onChange={e => setEditAd((p: any) => ({...p, name:e.target.value}))}
                        placeholder="Název šablony" style={{ flex:1 }} />
                      <select className="form-select" value={editAd.platform} style={{ width:130 }}
                        onChange={e => setEditAd((p: any) => ({...p, platform:e.target.value}))}>
                        {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <textarea className="form-textarea" rows={8} value={editAd.content}
                      onChange={e => setEditAd((p: any) => ({...p, content:e.target.value}))} />
                    <div style={{ display:'flex', gap:8, marginTop:10 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveAd}>Uložit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditAd(null)}>Zrušit</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div>
                        <span style={{ fontWeight:700, fontSize:14 }}>{ad.name}</span>
                        <span className="badge badge-blue" style={{ marginLeft:8, fontSize:10 }}>{ad.platform}</span>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => copy(renderTemplate(ad.content, adVars))}>
                          {copied && selectedAd?.id===ad.id ? '✅ Zkopírováno' : '📋 Kopírovat'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditAd(ad); setSelectedAd(ad); }}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteAd(ad.id)}>🗑️</button>
                      </div>
                    </div>
                    <pre style={{ fontSize:12, color:'var(--muted)', whiteSpace:'pre-wrap',
                      background:'var(--bg)', borderRadius:'var(--r-sm)', padding:12, margin:0, fontFamily:'inherit' }}>
                      {renderTemplate(ad.content, adVars)}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {/* Nová šablona */}
            {newAdOpen ? (
              <div className="card" style={{ padding:20 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Nová šablona</h3>
                <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                  <input className="form-input" value={newAd.name}
                    onChange={e => setNewAd(p => ({...p, name:e.target.value}))}
                    placeholder="Název šablony" style={{ flex:1 }} />
                  <select className="form-select" value={newAd.platform} style={{ width:130 }}
                    onChange={e => setNewAd(p => ({...p, platform:e.target.value}))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <textarea className="form-textarea" rows={6} value={newAd.content}
                  onChange={e => setNewAd(p => ({...p, content:e.target.value}))}
                  placeholder="Text inzerátu. Použij {služba}, {cena_od}, {telefon}, {lokalita}..." />
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  <button className="btn btn-primary btn-sm" onClick={createAd}
                    disabled={!newAd.name||!newAd.content}>Vytvořit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setNewAdOpen(false)}>Zrušit</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setNewAdOpen(true)}>+ Přidat šablonu</button>
            )}
          </div>
        </div>
      )}

      {/* ── Sběr recenzí ── */}
      {tab === 'review' && (
        <div className="card" style={{ padding:28, maxWidth:600 }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Požádat zákazníka o recenzi</h3>
          <p style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>
            Zadej ID zakázky (číselné ID, ne číslo zakázky) — systém vygeneruje personalizovanou zprávu
            s odkazem na Google/Facebook recenzi. Odkaz nastav v Nastavení → review_google_url / review_facebook_url.
          </p>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input className="form-input" value={reviewOrderId}
              onChange={e => setReviewOrderId(e.target.value)}
              placeholder="ID zakázky (číslo)" style={{ width:180 }} type="number" />
            <button className="btn btn-primary" onClick={genReview}
              disabled={!reviewOrderId || reviewLoading}>
              {reviewLoading ? 'Generuji…' : 'Vygenerovat zprávu'}
            </button>
          </div>
          {reviewMsg && (
            <div>
              <textarea className="form-textarea" rows={8} value={reviewMsg}
                onChange={e => setReviewMsg(e.target.value)} style={{ fontFamily:'inherit' }} />
              <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }}
                onClick={() => copy(reviewMsg)}>
                📋 Kopírovat zprávu
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Newsletter ── */}
      {tab === 'newsletter' && (
        <div className="card" style={{ padding:28, maxWidth:700 }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Newsletter šablona</h3>
          <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
            Uprav text, zkopíruj a rozešli existujícím zákazníkům přes Messenger / WhatsApp.
          </p>
          <textarea className="form-textarea" rows={12} value={newsletter}
            onChange={e => setNewsletter(e.target.value)}
            style={{ fontFamily:'inherit', fontSize:14 }} />
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button className="btn btn-primary" onClick={() => copy(newsletter)}>
              📋 Kopírovat text
            </button>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setNewsletter('Dobrý den!\n\nVáš ZdeVer Repair přichází s novinkami...\n\nZdeněk')}>
              Reset
            </button>
          </div>
        </div>
      )}
      {/* ── Segmenty zákazníků (Zákazníci → Marketing) ── */}
      {tab === 'segments' && (
        <div>
          <div className="card" style={{ padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>👥 Segmentace zákazníků pro cílenou komunikaci</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Segmenty se počítají dle nastavení "Neaktivní zákazník po X dnech" v Nastavení → Automatizace.
              Kliknutím na segment zkopíruješ šablonu zprávy pro daný segment.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {[
                {
                  label: '🏆 Věrní zákazníci',
                  desc: 'Zákazníci s 3+ zakázkami — nejvyšší LTV',
                  color: 'var(--green)',
                  msg: `Dobrý den! Rádi bychom Vám poděkovali za Vaši věrnost. Pro naše stálé zákazníky máme připravenu speciální nabídku — kontaktujte nás a domluvíme se. ZdeVer Repair, ${settings.company_phone || ''}`,
                },
                {
                  label: '🔄 Zákazníci k reaktivaci',
                  desc: 'Zákazníci bez zakázky déle než 6 měsíců',
                  color: 'var(--amber)',
                  msg: `Dobrý den! Dlouho jsme Vás neviděli. Připomínáme, že nabízíme kompletní servis elektroniky — diagnostika zdarma. Rádi Vám pomůžeme. ZdeVer Repair, ${settings.company_phone || ''}`,
                },
                {
                  label: '🆕 Noví zákazníci',
                  desc: 'Po první zakázce — follow-up a budování vztahu',
                  color: 'var(--blue)',
                  msg: `Dobrý den! Doufáme, že jste se zařízením spokojeni. Pokud budete cokoliv potřebovat, jsme tu pro Vás. Nezapomeňte, že na opravu máte 30 dní záruky. ZdeVer Repair`,
                },
              ].map((seg, i) => (
                <div key={i} className="card" style={{ padding: 18, borderLeft: `3px solid ${seg.color}` }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{seg.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{seg.desc}</div>
                  <pre style={{ fontSize: 11, background: 'var(--bg)', borderRadius: 6, padding: 10, whiteSpace: 'pre-wrap', color: 'var(--muted)', marginBottom: 10, fontFamily: 'inherit' }}>{seg.msg}</pre>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    navigator.clipboard.writeText(seg.msg);
                    alert('📋 Zpráva zkopírována do schránky!');
                  }}>📋 Kopírovat šablonu</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}