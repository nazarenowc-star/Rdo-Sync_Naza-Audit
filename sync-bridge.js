// ============================================
// SYNC-BRIDGE - VERSÃO SIMPLIFICADA E GARANTIDA
// ============================================

(function() {
    console.log('%c🔵 SISTEMA DE SINCRONIZAÇÃO ATIVADO', 'color: #005c8f; font-size: 20px; font-weight: bold');
    
    // ===== CONFIGURAÇÃO =====
    const CONFIG = {
        collection: 'rdo_operadores',
        checkInterval: 3000, // 3 segundos
        minTextLength: 30
    };
    
    // ===== ESTADO =====
    let firebaseReady = false;
    let lastSendTime = 0;
    let lastReceiveTime = localStorage.getItem('lastSyncTime') || '2000-01-01';
    let syncEnabled = true;
    
    // ===== INICIALIZAR FIREBASE =====
    async function initFirebase() {
        console.log('📥 Inicializando Firebase...');
        
        // Se já existe, usar
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            console.log('✅ Firebase já inicializado');
            firebaseReady = true;
            return true;
        }
        
        // Tentar carregar configuração
        if (typeof firebaseConfig !== 'undefined') {
            try {
                firebase.initializeApp(firebaseConfig);
                console.log('✅ Firebase inicializado com config existente');
                firebaseReady = true;
                return true;
            } catch (e) {
                console.error('Erro ao inicializar:', e);
            }
        }
        
        // Se não conseguiu, criar configuração padrão (substitua pelos seus dados)
        const config = {
            apiKey: "AIzaSyAquiVaSuaApiKey",
            authDomain: "rdo-sync.firebaseapp.com",
            projectId: "rdo-sync",
            storageBucket: "rdo-sync.appspot.com",
            messagingSenderId: "123456789",
            appId: "1:123456789:web:abc123"
        };
        
        try {
            firebase.initializeApp(config);
            console.log('✅ Firebase inicializado com config padrão');
            firebaseReady = true;
            return true;
        } catch (e) {
            console.error('❌ Falha crítica no Firebase:', e);
            return false;
        }
    }
    
    // ===== DETECTAR SISTEMA =====
    function detectSystem() {
        if (document.getElementById('preview')) {
            return 'RDO';
        }
        if (document.getElementById('txtOperadores')) {
            return 'COMPARADOR';
        }
        return 'UNKNOWN';
    }
    
    // ===== FUNÇÕES DO RDO (Envio) =====
    function setupRDO() {
        console.log('📱 Configurando RDO-Correias para ENVIO');

        const preview = document.getElementById('preview');
        if (!preview) {
            console.log('❌ Preview não encontrado');
            return;
        }

        function getPreviewText() {
            // suporta <textarea>, <div>, <pre>, etc.
            const v = (preview.value ?? '').trim();
            if (v) return v;
            const t = (preview.textContent ?? preview.innerText ?? '').trim();
            return t;
        }

        // dedupe por conteúdo (para não depender de botão WhatsApp)
        let lastSentText = localStorage.getItem('sync_bridge_lastSentText') || '';

        async function sendData(force = false) {
            if (!firebaseReady || !syncEnabled) return;

            const text = getPreviewText();
            if (!text || text.length < CONFIG.minTextLength) return;

            if (!force && text === lastSentText) return;

            // Evitar spam (mesmo com mudanças rápidas)
            const now = Date.now();
            if (!force && (now - lastSendTime) < 1500) return;
            lastSendTime = now;

            console.log('📤 Enviando dados...');

            try {
                const db = firebase.firestore();

                // Extrair data
                const dataMatch = text.match(/Data:\s*(\d{4}-\d{2}-\d{2})/);
                const data = dataMatch ? dataMatch[1] : new Date().toISOString().split('T')[0];

                await db.collection(CONFIG.collection).add({
                    text: text,
                    data: data,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    syncedAt: new Date().toISOString(),
                    syncedAtMs: Date.now(),
                    source: 'rdo'
                });

                lastSentText = text;
                localStorage.setItem('sync_bridge_lastSentText', lastSentText);
                localStorage.setItem('lastSendTime', new Date().toISOString());

                console.log('✅ Dados enviados com sucesso!');
                showNotification('📤 Dados sincronizados!');

            } catch (error) {
                console.error('❌ Erro ao enviar:', error);
            }
        }

        // Expor para botão "🔄 FORÇAR"
        window.__syncBridgeForceSend = () => sendData(true);

        // 1) Observer DOM (quando preview é <div>/<pre>)
        const observer = new MutationObserver(() => {
            clearTimeout(window.sendTimeout);
            window.sendTimeout = setTimeout(() => sendData(false), 800);
        });

        observer.observe(preview, { childList: true, characterData: true, subtree: true });

        // 2) Se preview for <textarea>, precisa de input (mutation não dispara em .value)
        preview.addEventListener('input', () => {
            clearTimeout(window.sendTimeout);
            window.sendTimeout = setTimeout(() => sendData(false), 800);
        });

        // 3) Hook nos botões (ajuda, mas não depende deles)
        const btnWA = document.getElementById('sendWA');
        if (btnWA) btnWA.addEventListener('click', () => setTimeout(() => sendData(true), 200));

        const btnCopy = document.getElementById('copyTxt');
        if (btnCopy) btnCopy.addEventListener('click', () => setTimeout(() => sendData(true), 200));

        // 4) Timer seguro: tenta enviar só se mudou
        setInterval(() => sendData(false), 4000);

        // 5) Primeira tentativa
        setTimeout(() => sendData(true), 1500);

        console.log('✅ RDO configurado (gatilho independente do WhatsApp)!');
    }

    // ===== FUNÇÕES DO COMPARADOR (Recepção) =====
    function setupComparador() {
        console.log('📊 Configurando Comparador-V70 para RECEPÇÃO');
        
        const textarea = document.getElementById('txtOperadores');
        if (!textarea) {
            console.log('❌ Textarea não encontrada');
            return;
        }
        
        // Função de receber dados
        async function receiveData(force = false) {
            if (!firebaseReady || !syncEnabled) return;

            console.log('📥 Buscando novos dados...');

            try {
                const db = firebase.firestore();

                // Cursor de recepção (ms). NÃO use "agora", use o último processado.
                let cursorMs = parseInt(localStorage.getItem('sync_bridge_cursorMs') || '0', 10);
                if (force) cursorMs = 0;

                // Buscar lote maior. Tentativa 1: syncedAtMs (quando disponível).
                let docs = [];
                try {
                    const snap = await db.collection(CONFIG.collection)
                        .orderBy('syncedAtMs', 'asc')
                        .startAfter(cursorMs)
                        .limit(200)
                        .get();
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                } catch (e) {
                    // Fallback para timestamp (caso a coleção antiga não tenha syncedAtMs/index)
                    console.warn('⚠️ Fallback timestamp query:', e?.message || e);
                    const snap = await db.collection(CONFIG.collection)
                        .orderBy('timestamp', 'asc')
                        .limit(200)
                        .get();
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                }

                let novos = 0;
                let maxMs = cursorMs;

                // Dedupe simples
                const seenKey = 'sync_bridge_seenIds';
                const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));

                for (const data of docs) {
                    const tsMs = (typeof data.syncedAtMs === 'number')
                        ? data.syncedAtMs
                        : (data.timestamp?.toDate ? data.timestamp.toDate().getTime() : (data.syncedAt ? new Date(data.syncedAt).getTime() : 0));

                    // Se vier no fallback (sem cursor), respeitar cursorMs
                    if (!force && tsMs && tsMs <= cursorMs) continue;

                    const text = data.text || '';
                    if (!text || text.length < CONFIG.minTextLength) continue;

                    // Evitar duplicar: por id e também por trecho no textarea
                    if (data.id && seen.has(data.id)) continue;

                    if (!textarea.value.includes(text.substring(0, 120))) {
                        textarea.value = textarea.value.trim()
                            ? (textarea.value + '\n\n--- NOVO RELATÓRIO ---\n\n' + text)
                            : text;
                        novos++;
                    }

                    if (data.id) seen.add(data.id);
                    if (tsMs && tsMs > maxMs) maxMs = tsMs;
                }

                // Persistir dedupe/cursor
                localStorage.setItem(seenKey, JSON.stringify(Array.from(seen).slice(-500)));
                if (novos > 0) {
                    console.log(`✅ ${novos} novo(s) relatório(s) recebido(s)`);
                    localStorage.setItem('sync_bridge_cursorMs', String(maxMs || Date.now()));

                    // Disparar eventos
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));

                    // Processar automaticamente
                    setTimeout(() => {
                        if (typeof processOperadoresCompleto === 'function') {
                            console.log('⚙️ Processando dados...');
                            processOperadoresCompleto();
                        }
                    }, 600);

                    showNotification(`📥 ${novos} novo(s) relatório(s)!`);
                }

            } catch (error) {
                console.error('❌ Erro ao receber:', error);
            }
        }

        // Expor para botão "🔄 FORÇAR"
        window.__syncBridgeForceReceive = () => receiveData(true);

        // Buscar a cada 5 segundos
        setInterval(receiveData, 5000);
        
        // Buscar agora
        setTimeout(receiveData, 2000);
        
        console.log('✅ Comparador configurado!');
    }
    
    // ===== NOTIFICAÇÃO SIMPLES =====
    function showNotification(message) {
        const notif = document.createElement('div');
        notif.textContent = message;
        notif.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #005c8f;
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        
        // Adicionar animação
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.style.animation = 'slideOut 0.3s ease';
            notif.style.transform = 'translateX(100px)';
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }
    
    // ===== ADICIONAR BOTÕES DE CONTROLE =====
    function addControlButtons() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 99999;
        `;
        
        // Botão status
        const statusBtn = document.createElement('div');
        statusBtn.style.cssText = `
            background: ${firebaseReady ? '#28a745' : '#ff9800'};
            color: white;
            padding: 8px 16px;
            border-radius: 30px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        statusBtn.innerHTML = firebaseReady ? '● CONECTADO' : '● CONECTANDO...';
        
        statusBtn.onclick = () => {
            syncEnabled = !syncEnabled;
            statusBtn.style.background = syncEnabled ? '#28a745' : '#dc3545';
            statusBtn.innerHTML = syncEnabled ? '● ATIVO' : '● PAUSADO';
        };
        
        // Botão forçar sincronização
        const syncBtn = document.createElement('div');
        syncBtn.style.cssText = `
            background: #005c8f;
            color: white;
            padding: 8px 16px;
            border-radius: 30px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        syncBtn.innerHTML = '🔄 FORÇAR';
        
        syncBtn.onclick = () => {
            const system = detectSystem();
            if (system === 'RDO') {
                console.log('📤 Forçando envio manual...');
                if (typeof window.__syncBridgeForceSend === 'function') {
                    window.__syncBridgeForceSend();
                } else {
                    console.warn('⚠️ ForceSend não disponível (RDO ainda não inicializou).');
                }
            } else if (system === 'COMPARADOR') {
                console.log('📥 Forçando busca manual...');
                if (typeof window.__syncBridgeForceReceive === 'function') {
                    window.__syncBridgeForceReceive();
                } else {
                    console.warn('⚠️ ForceReceive não disponível (Comparador ainda não inicializou).');
                }
            } else {
                console.warn('⚠️ Sistema não detectado para forçar sync.');
            }
        };
        
        panel.appendChild(statusBtn);
        panel.appendChild(syncBtn);
        document.body.appendChild(panel);
    }
    
    // ===== INICIAR =====
    async function start() {
        console.log('🚀 Iniciando sync-bridge...');
        
        // Inicializar Firebase
        const fbOk = await initFirebase();
        if (!fbOk) {
            console.log('❌ Falha no Firebase, tentando novamente em 5s...');
            setTimeout(start, 5000);
            return;
        }
        
        // Adicionar botões de controle
        addControlButtons();
        
        // Detectar sistema e configurar
        const system = detectSystem();
        console.log(`📌 Sistema detectado: ${system}`);
        
        if (system === 'RDO') {
            setupRDO();
        } else if (system === 'COMPARADOR') {
            setupComparador();
        } else {
            console.log('⏳ Sistema não identificado, aguardando...');
            setTimeout(start, 3000);
        }
    }
    
    // Iniciar quando a página carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
