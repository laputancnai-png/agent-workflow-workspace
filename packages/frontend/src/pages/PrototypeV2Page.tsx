import { useEffect, useState } from 'react';

import prototypeHtml from '../prototype-v2.html?raw';

export function PrototypeV2Page() {
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!import.meta.hot) return;
    const reload = () => setReloadKey((value) => value + 1);
    import.meta.hot.on('vite:afterUpdate', reload);
    return () => {
      import.meta.hot?.off('vite:afterUpdate', reload);
    };
  }, []);

  return (
    <iframe
      key={reloadKey}
      style={{ width: '100vw', height: '100vh', border: 0, display: 'block', background: '#fff' }}
      srcDoc={prototypeHtml}
      title="AWW Prototype v2"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-top-navigation-by-user-activation"
    />
  );
}
