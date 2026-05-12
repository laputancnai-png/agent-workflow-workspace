import { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const C = {
  p: 'oklch(67% 0.19 55)',
  ph: 'oklch(59% 0.21 55)',
  ag: 'oklch(63% 0.14 195)',
  agl: 'oklch(93% 0.07 195)',
  ok: 'oklch(61% 0.16 145)',
  okl: 'oklch(93% 0.06 145)',
  tx: 'oklch(18% 0.01 75)',
  txm: 'oklch(45% 0.01 75)',
  txs: 'oklch(62% 0.01 75)',
  bg: 'linear-gradient(150deg, oklch(98% 0.004 78) 0%, oklch(95.5% 0.014 68) 100%)',
  glass: 'rgba(255,255,255,0.65)',
  glassB: 'rgba(255,255,255,0.88)',
  glassS: '0 4px 28px rgba(0,0,0,0.07)',
};

function AwwLogo({ size = 40 }: { size?: number }) {
  const r = size * 0.135;
  const cx = size * 0.12, cy = size * 0.5;
  const mx = size * 0.5, my = size * 0.5;
  const rx = size * 0.88, ry = size * 0.5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <line x1={cx + r} y1={cy} x2={mx - r * 1.5} y2={my} stroke={C.p} strokeWidth={size * 0.044} strokeLinecap="round" opacity={0.4} />
        <line x1={mx + r * 1.5} y1={my} x2={rx - r} y2={ry} stroke={C.p} strokeWidth={size * 0.044} strokeLinecap="round" opacity={0.4} />
        <circle cx={cx} cy={cy} r={r} fill={C.agl} stroke={C.ag} strokeWidth={size * 0.048} />
        <circle cx={mx} cy={my} r={r * 1.38} fill={C.p} />
        <circle cx={mx} cy={my - r * 0.28} r={r * 0.44} fill="#fff" opacity={0.95} />
        <path d={`M${mx - r * 0.68} ${my + r * 0.55} Q${mx - r * 0.45} ${my + r * 0.08} ${mx} ${my + r * 0.08} Q${mx + r * 0.45} ${my + r * 0.08} ${mx + r * 0.68} ${my + r * 0.55}`} fill="#fff" opacity={0.95} />
        <circle cx={rx} cy={ry} r={r} fill={C.okl} stroke={C.ok} strokeWidth={size * 0.048} />
        <path d={`M${rx - r * 0.48} ${ry} L${rx - r * 0.08} ${ry + r * 0.42} L${rx + r * 0.52} ${ry - r * 0.46}`} stroke={C.ok} strokeWidth={size * 0.058} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: size * 0.44, letterSpacing: -0.5, color: C.tx, lineHeight: 1 }}>AWW</span>
    </div>
  );
}

export function LoginPage() {
  const [hovered, setHovered] = useState(false);

  const handleGitHubLogin = () => {
    window.location.href = `${BACKEND_URL}/api/v1/auth/login`;
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: C.glass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${C.glassB}`,
        boxShadow: C.glassS,
        borderRadius: 20,
        padding: '40px 44px',
        width: '100%',
        maxWidth: 380,
      }}>
        <div style={{ marginBottom: 28 }}>
          <AwwLogo size={40} />
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.tx, letterSpacing: -0.5, lineHeight: 1.25, margin: '0 0 10px' }}>
          Agent Workflow<br />Workspace
        </h1>
        <p style={{ fontSize: 13.5, color: C.txm, lineHeight: 1.65, margin: '0 0 28px' }}>
          Human-in-the-loop AI delivery — define workflows, assign steps to agents or humans, ship with a full audit trail.
        </p>

        <button
          type="button"
          onClick={handleGitHubLogin}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '11px 20px',
            background: hovered ? C.ph : C.p,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            boxShadow: `0 2px 12px ${C.p}50`,
            transition: 'background 0.15s ease',
            fontFamily: 'inherit',
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Login with GitHub
        </button>
      </div>
    </div>
  );
}
