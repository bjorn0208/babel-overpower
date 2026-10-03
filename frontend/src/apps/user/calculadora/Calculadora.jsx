// @ts-nocheck
/* eslint-disable */
/**
 * App Calculadora — extraído de bundle.jsx (era L4634-L4730).
 * Calculadora básica do OS (sem dependência de RAGENTIC_DATA).
 */
import { useState } from 'react';

export function Calculadora() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [waitNew, setWaitNew] = useState(false);

  const inputDigit = (d) => {
    if (waitNew) { setDisplay(String(d)); setWaitNew(false); }
    else setDisplay(display === '0' ? String(d) : display + d);
  };
  const inputDot = () => {
    if (waitNew) { setDisplay('0.'); setWaitNew(false); }
    else if (!display.includes('.')) setDisplay(display + '.');
  };
  const clear = () => { setDisplay('0'); setPrev(null); setOp(null); setWaitNew(false); };
  const toggleSign = () => setDisplay(String(parseFloat(display) * -1));
  const percent = () => setDisplay(String(parseFloat(display) / 100));
  const calc = (a, b, o) => {
    switch (o) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  };
  const setOper = (o) => {
    const cur = parseFloat(display);
    if (prev !== null && op && !waitNew) {
      const r = calc(prev, cur, op);
      setPrev(r);
      setDisplay(String(r));
    } else setPrev(cur);
    setOp(o); setWaitNew(true);
  };
  const equals = () => {
    if (prev === null || op === null) return;
    const r = calc(prev, parseFloat(display), op);
    setDisplay(String(r));
    setPrev(null); setOp(null); setWaitNew(true);
  };

  const Btn = ({ l, on, kind, span }) => (
    <button onClick={on}
      style={{
        gridColumn: span ? `span ${span}` : undefined,
        height: 56,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        background:
          kind === 'op' ? 'linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))' :
          kind === 'fn' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
        color: 'var(--txt-1)',
        fontSize: 20, fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 100ms',
        boxShadow: kind === 'op' ? '0 4px 14px oklch(0.65 0.22 280 / 0.35)' : 'none',
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
      onMouseUp={(e) => e.currentTarget.style.transform = ''}
      onMouseLeave={(e) => e.currentTarget.style.transform = ''}
    >{l}</button>
  );

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="os-card" style={{ padding: 18, marginBottom: 14, textAlign: 'right', minHeight: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {op && <div className="muted mono small">{prev} {op}</div>}
        <div className="kpi-num" style={{ fontSize: 44, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{display}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, flex: 1 }}>
        <Btn l="C" on={clear} kind="fn" />
        <Btn l="±" on={toggleSign} kind="fn" />
        <Btn l="%" on={percent} kind="fn" />
        <Btn l="÷" on={() => setOper('÷')} kind="op" />
        <Btn l="7" on={() => inputDigit(7)} />
        <Btn l="8" on={() => inputDigit(8)} />
        <Btn l="9" on={() => inputDigit(9)} />
        <Btn l="×" on={() => setOper('×')} kind="op" />
        <Btn l="4" on={() => inputDigit(4)} />
        <Btn l="5" on={() => inputDigit(5)} />
        <Btn l="6" on={() => inputDigit(6)} />
        <Btn l="−" on={() => setOper('−')} kind="op" />
        <Btn l="1" on={() => inputDigit(1)} />
        <Btn l="2" on={() => inputDigit(2)} />
        <Btn l="3" on={() => inputDigit(3)} />
        <Btn l="+" on={() => setOper('+')} kind="op" />
        <Btn l="0" on={() => inputDigit(0)} span={2} />
        <Btn l="." on={inputDot} />
        <Btn l="=" on={equals} kind="op" />
      </div>
    </div>
  );
}
