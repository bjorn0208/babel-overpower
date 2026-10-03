import { useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

export function Onboarding({ onConcluir }) {
  const [step, setStep] = useState(0);
  const [nicho, setNicho] = useState(null);
  const [nomeAgente, setNomeAgente] = useState('Carol');
  const [confetti, setConfetti] = useState(false);
  const t = useToast();
  const total = 5;
  const finalizar = () => {
    setStep(4);
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3000);
  };

  return (
    <div className="col" style={{ height:'100%', position:'relative' }}>
      <div className="row gap-3" style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.06)', alignItems:'center' }}>
        <Icon name="spark" size={16} stroke="var(--os-acento-1)" />
        <div className="h3" style={{ fontSize: 14 }}>Vamos configurar seu agente</div>
        <div className="flex-1"></div>
        <div className="row gap-1">
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: i === step ? 28 : 8, height: 8, borderRadius: 4, background: i <= step ? 'linear-gradient(90deg, var(--os-acento-1), var(--os-acento-2))' : 'rgba(255,255,255,0.10)', transition: 'all 200ms' }}></div>
          ))}
        </div>
        <span className="muted small mono">{step+1}/{total}</span>
      </div>

      <div className="flex-1 scroll center" style={{ overflowY:'auto', padding: 32, flexDirection:'column' }}>
        {step === 0 && (
          <div className="center col gap-4" style={{ textAlign:'center', maxWidth: 480 }}>
            <div style={{ width: 96, height: 96, borderRadius: 28, background:'linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: 40, boxShadow:'0 16px 48px oklch(0.65 0.22 280 / 0.4)' }}>
              <Icon name="spark" size={48} stroke="white" />
            </div>
            <div className="h1" style={{ fontSize: 32 }}>Bem-vindo, <span className="os-aurora-text">Theus</span>!</div>
            <div className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 380 }}>
              Em 5 minutos seu primeiro agente WhatsApp já vai estar rodando.
              Vamos configurar nicho, persona e conectar Z-API.
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>Vamos começar <Icon name="arrowRight" size={14}/></button>
          </div>
        )}

        {step === 1 && (
          <div style={{ maxWidth: 720, width: '100%' }}>
            <div className="h2" style={{ textAlign:'center', marginBottom: 6 }}>Em qual nicho você atua?</div>
            <div className="muted" style={{ textAlign:'center', marginBottom: 22 }}>Vamos clonar blocos prontos do nicho pro seu agente.</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 12 }}>
              {[
                { id:'limpeza', nome:'Limpeza de Nome', icon:'eye' },
                { id:'saude', nome:'Saúde', icon:'check' },
                { id:'juridico', nome:'Jurídico', icon:'shield' },
                { id:'estetica', nome:'Estética', icon:'star' },
                { id:'imobiliario', nome:'Imobiliário', icon:'building' },
                { id:'educacao', nome:'Educação', icon:'book' },
              ].map(n => (
                <button key={n.id} className={`os-card lift ${nicho === n.id ? 'glow-aurora' : ''}`}
                  style={{ padding: 20, cursor:'pointer', background: nicho === n.id ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)', flexDirection:'column', alignItems:'flex-start' }}
                  onClick={() => setNicho(n.id)}>
                  <Icon name={n.icon} size={26} stroke={nicho === n.id ? 'var(--os-acento-1)' : 'var(--txt-2)'} />
                  <div className="h3" style={{ fontSize: 14, marginTop: 12 }}>{n.nome}</div>
                </button>
              ))}
            </div>
            <div className="row gap-2 center" style={{ marginTop: 22, padding: 12, background:'rgba(255,255,255,0.025)', borderRadius: 10 }}>
              <div className="chk" onClick={() => setNicho('outro')}>
                {nicho === 'outro' && <Icon name="check" size={11} stroke="white"/>}
              </div>
              <span className="small">Outro / não tem nicho específico</span>
            </div>
            <div className="row" style={{ justifyContent:'space-between', marginTop: 24 }}>
              <button className="btn" onClick={() => setStep(0)}><Icon name="arrowLeft" size={13}/> Voltar</button>
              <button className="btn btn-primary" disabled={!nicho} onClick={() => setStep(2)}>Próximo <Icon name="arrowRight" size={13}/></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ maxWidth: 600, width: '100%' }}>
            <div className="h2" style={{ textAlign:'center', marginBottom: 22 }}>Configure seu primeiro agente</div>
            <div className="os-card col gap-3" style={{ padding: 22 }}>
              <div className="row gap-3">
                <div style={{ width: 64, height: 64, borderRadius: 14, background:'linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: 24, fontWeight: 700 }}>{(nomeAgente[0] || 'C').toUpperCase()}</div>
                <div className="flex-1">
                  <label className="label">Nome do agente</label>
                  <input className="input" value={nomeAgente} onChange={(e) => setNomeAgente(e.target.value)} />
                </div>
              </div>
              <div><label className="label">Em uma frase, quem é o agente?</label>
                <input className="input" defaultValue="Vendedora consultiva especializada em limpeza de nome." />
              </div>
            </div>
            <div className="os-card col gap-2" style={{ padding: 16, marginTop: 12 }}>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">6 cargos prontos serão clonados</span></div>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">20 blocos de conhecimento do nicho</span></div>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">Prompt sistema gerado automaticamente</span></div>
            </div>
            <div className="row" style={{ justifyContent:'space-between', marginTop: 24 }}>
              <button className="btn" onClick={() => setStep(1)}><Icon name="arrowLeft" size={13}/> Voltar</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Criar agente <Icon name="arrowRight" size={13}/></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ maxWidth: 540, width: '100%' }}>
            <div className="h2" style={{ textAlign:'center', marginBottom: 6 }}>Conecte seu WhatsApp</div>
            <div className="muted" style={{ textAlign:'center', marginBottom: 22 }}>Plugue Z-API agora ou pule e configure depois.</div>
            <div className="os-card col gap-3" style={{ padding: 22 }}>
              <div><label className="label">Instance ID</label><input className="input mono" placeholder="3D4F2B..." /></div>
              <div><label className="label">Token</label><input className="input mono" type="password" placeholder="••••••••••" /></div>
              <button className="btn btn-sm" onClick={() => t.success('Conexão OK · +55 11 9XXXX-1234')}><Icon name="refresh" size={12}/> Testar conexão</button>
            </div>
            <div className="row" style={{ justifyContent:'space-between', marginTop: 24 }}>
              <button className="btn" onClick={() => setStep(2)}><Icon name="arrowLeft" size={13}/> Voltar</button>
              <div className="row gap-2">
                <button className="btn" onClick={finalizar}>Pular por enquanto</button>
                <button className="btn btn-primary" onClick={finalizar}>Conectar e finalizar <Icon name="arrowRight" size={13}/></button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="center col gap-4" style={{ textAlign:'center', maxWidth: 520 }}>
            <div style={{ fontSize: 64 }}>🎉</div>
            <div className="h1" style={{ fontSize: 28 }}>Tudo certo, <span className="os-aurora-text">Theus</span>!</div>
            <div className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>
              Seu agente <strong style={{ color:'var(--txt-1)' }}>{nomeAgente}</strong> já está no ar.
            </div>
            <div className="os-card col gap-2" style={{ padding: 16, width: '100%', textAlign:'left' }}>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">6 cargos clonados</span></div>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">20 blocos de conhecimento do nicho</span></div>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">Z-API conectada (se preenchida)</span></div>
              <div className="row gap-2"><Icon name="check" size={14} stroke="oklch(0.85 0.18 145)"/><span className="small">Trial de 7 dias ativo</span></div>
            </div>
            <div className="row gap-2" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { onConcluir?.('chat-teste'); }}>Abrir Chat Treino</button>
              <button className="btn btn-primary btn-lg" onClick={() => onConcluir?.()}>Ir para o Desktop <Icon name="arrowRight" size={13}/></button>
            </div>
          </div>
        )}
      </div>

      {confetti && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
          {Array.from({length: 50}).map((_, i) => (
            <div key={i} style={{
              position:'absolute',
              left: `${Math.random()*100}%`,
              top: '-20px',
              width: 8, height: 8,
              background: ['oklch(0.7 0.18 220)','oklch(0.65 0.22 280)','oklch(0.78 0.18 80)','oklch(0.72 0.18 145)'][i%4],
              borderRadius: i%2 ? '50%' : '2px',
              animation: `confettiFall ${2 + Math.random()*2}s linear ${Math.random()*0.5}s forwards`,
            }}></div>
          ))}
        </div>
      )}
    </div>
  );
}
