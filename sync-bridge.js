// ============================================
// SYNC-BRIDGE v2 — Migração 100% confiável (cursor + dedupe)
// - Resolve: "só o 1º exemplo migra" (limit(5) + lastSyncTime=agora)
// - Compatível com Firebase compat (firebase-app-compat + firestore-compat)
// ============================================

(function () {
  console.log('%c🟦 SYNC-BRIDGE v2 ATIVO', 'color:#005c8f;font-weight:900;font-size:16px');

  const CONFIG = {
    collection: 'rdo_operadores',
    pollMs: 4000,
    minTextLength: 30,
    // quantos docs por lote
    pageSize: 100,
    // limite de hashes em memória local (para não crescer infinito)
    maxHashes: 400
  };

  // ======== Estado ========
  let firebaseReady = false;
  let syncEnabled = true;

  // Cursor (sempre avança) — usa millis do cliente no envio
  const CURSOR_KEY = 'rdo_cursor_syncedAtMs_v2';
  let lastCursorMs = Number(localStorage.getItem(CURSOR_KEY) || '0') || 0;

  // Hashes recebidos (dedupe robusto)
  const HASH_KEY = 'rdo_received_hashes_v2';
  let receivedHashes = new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(HASH_KEY) || '[]');
    if (Array.isArray(arr)) arr.slice(-CONFIG.maxHashes).forEach(h => receivedHashes.add(String(h)));
  } catch (_) {}

  // ======== Utils ========
  function nowIso() { return new Date().toISOString(); }

  function djb2Hash(str) {
    // hash simples e rápido (estável)
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    // unsigned
    return (h >>> 0).toString(16);
  }

  function persistHashes() {
    try {
      const arr = Array.from(receivedHashes);
      // manter só os últimos maxHashes
      const trimmed = arr.slice(-CONFIG.maxHashes);
      localStorage.setItem(HASH_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // se estourar quota, reduz agressivamente
      try {
        const trimmed = Array.from(receivedHashes).slice(-120);
        localStorage.setItem(HASH_KEY, JSON.stringify(trimmed));
      } catch (_) {}
    }
  }

  function showNotification(message) {
    try {
      const notif = document.createElement('div');
      notif.textContent = message;
      notif.style.cssText = `
        position: fixed; bottom: 18px; right: 18px;
        background: #005c8f; color: #fff;
        padding: 10px 16px; border-radius: 999px;
        font-size: 13px; font-weight: 800;
        z-index: 999999; box-shadow: 0 6px 18px rgba(0,0,0,.22);
      `;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 2800);
    } catch (_) {}
  }

  // ======== Firebase init ========
  async function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      firebaseReady = true;
      console.log('✅ Firebase já estava inicializado');
      return true;
    }

    if (typeof firebaseConfig !== 'undefined' && typeof firebase !== 'undefined') {
      try {
        firebase.initializeApp(firebaseConfig);
        firebaseReady = true;
        console.log('✅ Firebase inicializado via firebaseConfig');
        return true;
      } catch (e) {
        console.error('❌ Erro ao inicializar Firebase com firebaseConfig:', e);
      }
    }

    console.error('❌ Firebase não encontrado/inicializado. Verifique se firebase-app-compat e firebase-config.js carregaram antes do sync-bridge.');
    firebaseReady = false;
    return false;
  }

  // ======== Detectar em qual página estamos ========
  function detectSystem() {
    if (document.getElementById('preview')) return 'RDO';
    if (document.getElementById('txtOperadores')) return 'COMPARADOR';
    return 'UNKNOWN';
  }

  // ======== RDO (ENVIO) ========
  function setupRDO() {
    console.log('📱 v2: setup RDO (ENVIO)');
    const preview = document.getElementById('preview');
    if (!preview) return;

    let lastSendAt = 0;

    async function sendData() {
      if (!firebaseReady || !syncEnabled) return;

      const text = (preview.textContent || preview.innerText || '').trim();
      if (!text || text.length < CONFIG.minTextLength) return;

      const now = Date.now();
      if (now - lastSendAt < 5000) return;
      lastSendAt = now;

      try {
        const db = firebase.firestore();

        const dataMatch = text.match(/Data:\s*(\d{4}-\d{2}-\d{2})/);
        const data = dataMatch ? dataMatch[1] : new Date().toISOString().split('T')[0];

        const hash = djb2Hash(text);

        // ID determinístico evita duplicar o mesmo RDO (hash)
        const docId = `rdo_${hash}`;

        await db.collection(CONFIG.collection).doc(docId).set({
          text,
          data,
          hash,
          // cursor confiável (sempre existe, sempre cresce)
          syncedAtMs: now,
          syncedAt: nowIso(),
          // timestamp do servidor (boa prática, mas pode ser null na leitura imediata)
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          source: 'rdo'
        }, { merge: true });

        localStorage.setItem('lastSendTime', nowIso());
        console.log('✅ v2: enviado (upsert):', docId);
        showNotification('📤 Sincronizado (nuvem)');
      } catch (e) {
        console.error('❌ v2: erro ao enviar:', e);
      }
    }

    const obs = new MutationObserver(() => {
      clearTimeout(window.__rdoSendT);
      window.__rdoSendT = setTimeout(sendData, 1200);
    });
    obs.observe(preview, { childList: true, characterData: true, subtree: true });

    setInterval(sendData, 10000);
    setTimeout(sendData, 2500);
  }

  // ======== COMPARADOR (RECEPÇÃO) ========
  function setupComparador() {
    console.log('📊 v2: setup Comparador (RECEPÇÃO)');
    const textarea = document.getElementById('txtOperadores');
    if (!textarea) return;

    // botão "reimportar tudo" (apenas no comparador)
    addComparadorTools();

    let receiving = false;

    async function receiveBatch() {
      if (!firebaseReady || !syncEnabled) return;
      if (receiving) return;
      receiving = true;

      try {
        const db = firebase.firestore();

        // Query principal: por cursor syncedAtMs
        let q = db.collection(CONFIG.collection)
          .where('syncedAtMs', '>', lastCursorMs)
          .orderBy('syncedAtMs', 'asc')
          .limit(CONFIG.pageSize);

        const snap = await q.get();

        let appended = 0;
        let maxMs = lastCursorMs;

        snap.forEach(doc => {
          const d = doc.data() || {};
          const text = String(d.text || '').trim();
          if (!text) return;

          const h = String(d.hash || djb2Hash(text));
          if (receivedHashes.has(h)) {
            // já importado
            if (typeof d.syncedAtMs === 'number' && d.syncedAtMs > maxMs) maxMs = d.syncedAtMs;
            return;
          }

          // append
          if (textarea.value.trim()) textarea.value += '\n\n--- NOVO RELATÓRIO (NUVEM) ---\n\n' + text;
          else textarea.value = text;

          receivedHashes.add(h);
          appended++;

          if (typeof d.syncedAtMs === 'number' && d.syncedAtMs > maxMs) maxMs = d.syncedAtMs;
        });

        if (appended > 0) {
          // Avança cursor para o último doc realmente processado (NUNCA para "agora")
          lastCursorMs = maxMs;
          localStorage.setItem(CURSOR_KEY, String(lastCursorMs));
          persistHashes();

          console.log(`✅ v2: ${appended} relatório(s) recebido(s). cursor=${lastCursorMs}`);
          // eventos para o processamento do V70
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));

          // processar automaticamente (se existir)
          setTimeout(() => {
            if (typeof processOperadoresCompleto === 'function') processOperadoresCompleto();
          }, 900);

          showNotification(`📥 ${appended} novo(s) relatório(s)`);
        }
      } catch (e) {
        console.error('❌ v2: erro ao receber:', e);
      } finally {
        receiving = false;
      }
    }

    // polling
    setInterval(receiveBatch, CONFIG.pollMs);
    setTimeout(receiveBatch, 1800);
  }

  function addComparadorTools() {
    if (document.getElementById('__syncToolsV2')) return;

    const wrap = document.createElement('div');
    wrap.id = '__syncToolsV2';
    wrap.style.cssText = `
      position: fixed; bottom: 18px; left: 18px;
      display:flex; gap:10px; z-index: 999999;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    `;

    const btnToggle = document.createElement('button');
    btnToggle.textContent = '● SYNC ATIVO';
    btnToggle.style.cssText = `
      background:#28a745;color:#fff;border:none;border-radius:999px;
      padding:8px 12px;font-weight:900;font-size:12px;cursor:pointer;
      box-shadow: 0 6px 18px rgba(0,0,0,.18);
    `;
    btnToggle.onclick = () => {
      syncEnabled = !syncEnabled;
      btnToggle.textContent = syncEnabled ? '● SYNC ATIVO' : '● SYNC PAUSADO';
      btnToggle.style.background = syncEnabled ? '#28a745' : '#dc3545';
    };

    const btnReimport = document.createElement('button');
    btnReimport.textContent = '↺ Reimportar TUDO';
    btnReimport.title = 'Zera o cursor e reimporta o histórico (use 1x quando corrigir a migração)';
    btnReimport.style.cssText = `
      background:#005c8f;color:#fff;border:none;border-radius:999px;
      padding:8px 12px;font-weight:900;font-size:12px;cursor:pointer;
      box-shadow: 0 6px 18px rgba(0,0,0,.18);
    `;
    btnReimport.onclick = () => {
      if (!confirm('Reimportar tudo? Isso vai buscar o histórico novamente.')) return;
      lastCursorMs = 0;
      localStorage.setItem(CURSOR_KEY, '0');
      receivedHashes = new Set();
      localStorage.removeItem(HASH_KEY);
      showNotification('↺ Cursor zerado. Vai reimportar...');
      console.log('↺ v2: cursor/hashes resetados');
    };

    wrap.appendChild(btnToggle);
    wrap.appendChild(btnReimport);
    document.body.appendChild(wrap);
  }

  // ======== Boot ========
  (async function boot() {
    const ok = await initFirebase();
    if (!ok) return;

    const sys = detectSystem();
    console.log('🔎 v2 detectSystem:', sys);

    if (sys === 'RDO') setupRDO();
    else if (sys === 'COMPARADOR') setupComparador();
    else console.warn('⚠️ v2: sistema não reconhecido (preview/txtOperadores não encontrados).');
  })();
})();
