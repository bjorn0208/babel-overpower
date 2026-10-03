/* Configuração do Babel OS (front).
   - No Mac (localhost/127.0.0.1): fala direto com o Supabase local.
   - Por outro endereço (túnel HTTPS, Vercel de teste): usa o próprio endereço + /sb, /cerebro, /voz
     (o servir.py ou os rewrites da Vercel repassam para o Mac).
   Para a nuvem de verdade: troque REMOTO_URL/REMOTO_KEY pelo projeto Supabase (Settings → API). */
(function(){
  var local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var REMOTO_URL=null, REMOTO_KEY=null; // ex.: 'https://<ref>.supabase.co' e a chave anon/publishable
  window.BABEL_CONFIG = {
    supabaseUrl: REMOTO_URL || (local ? 'http://127.0.0.1:54321' : location.origin + '/sb'),
    supabaseKey: REMOTO_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    cerebroUrl: local ? 'http://localhost:3078' : location.origin + '/cerebro',
    vozUrl: local ? 'http://localhost:3100' : location.origin + '/voz',
    proxy: !local && !REMOTO_URL
  };
})();
