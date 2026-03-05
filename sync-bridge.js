// ============================================
// SYNC-BRIDGE - VERSÃO CORRIGIDA E OTIMIZADA
// ============================================

(function() {
    console.log('%c🔵 SISTEMA DE SINCRONIZAÇÃO ATIVADO', 'color: #005c8f; font-size: 20px; font-weight: bold');

    // ===== CONFIGURAÇÃO =====
    const CONFIG = {
        collection: 'rdo_operadores', // Nome da coleção no Firestore
        checkInterval: 3000, // 3 segundos
        minTextLength: 20,
        // NÃO colocar a configuração do Firebase aqui. Ela virá do firebase-config.js
    };

    // ===== ESTADO =====
    let firebaseReady = false;
    let lastSendTime = 0;
    let lastReceiveTime = localStorage.getItem('lastSyncTime') || '2000-01-01';
    let syncEnabled = true;
    let db; // Referência para o Firestore

    // ===== INICIALIZAR FIREBASE =====
    function initFirebase() {
        console.log('📥 Verificando Firebase...');

        // Verifica se o Firebase foi carregado corretamente pelo firebase-config.js
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            console.log('✅ Firebase já inicializado.');
            db = firebase.firestore();
            firebaseReady = true;
            return true;
        } else {
            console.error('❌ Firebase não encontrado. Certifique-se de que o firebase-config.js foi carregado antes deste script.');
            // Tenta carregar novamente? É melhor falhar rápido e avisar o usuário.
            showNotification('❌ Erro: Firebase não carregado. Verifique o console.', 'error');
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
            // Prioriza textarea, depois textContent/innerText
            return (preview.value ?? preview.textContent ?? preview.innerText ?? '').trim();
        }

        let lastSentText = localStorage.getItem('sync_bridge_lastSentText') || '';

        async function sendData(force = false) {
            if (!firebaseReady || !syncEnabled) return;

            const text = getPreviewText();
            if (!text || text.length < CONFIG.minTextLength) {
                if(force) console.log('Texto muito curto para envio.');
                return;
            }

            if (!force && text === lastSentText) return;

            const now = Date.now();
            if (!force && (now - lastSendTime) < 2000) return;
            lastSendTime = now;

            console.log('📤 Enviando dados...', text.substring(0, 50) + '...');

            try {
                // Extrair data do texto (formato YYYY-MM-DD)
                const dataMatch = text.match(/Data:\s*(\d{4}-\d{2}-\d{2})/);
                // Fallback para data de hoje
                const dataHoje = new Date().toISOString().split('T')[0];
                const data = dataMatch ? dataMatch[1] : dataHoje;

                // Salvar no Firestore
                const docRef = await db.collection(CONFIG.collection).add({
                    text: text,
                    data: data,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Hora do servidor
                    syncedAt: new Date().toISOString(), // Hora local
                    syncedAtMs: Date.now(), // Timestamp local em ms
                    source: 'rdo'
                });

                console.log('✅ Dados enviados com sucesso! ID:', docRef.id);
                lastSentText = text;
                localStorage.setItem('sync_bridge_lastSentText', lastSentText);
                localStorage.setItem('rdoLastSync', Date.now().toString()); // Para o index.html
                showNotification('📤 Dados sincronizados!');

            } catch (error) {
                console.error('❌ Erro ao enviar para o Firestore:', error);
                showNotification('❌ Erro no envio: ' + error.message, 'error');
            }
        }

        window.__syncBridgeForceSend = () => sendData(true);

        // Observar mudanças no preview
        const observer = new MutationObserver(() => {
            clearTimeout(window.sendTimeout);
            window.sendTimeout = setTimeout(() => sendData(false), 1000);
        });
        observer.observe(preview, { childList: true, characterData: true, subtree: true });

        // Se for textarea, ouvir evento 'input'
        if (preview.tagName === 'TEXTAREA' || preview.tagName === 'INPUT') {
            preview.addEventListener('input', () => {
                clearTimeout(window.sendTimeout);
                window.sendTimeout = setTimeout(() => sendData(false), 1000);
            });
        }

        // Timer de segurança
        setInterval(() => sendData(false), 5000);
        setTimeout(() => sendData(true), 2000);

        console.log('✅ RDO configurado!');
    }

    // ===== FUNÇÕES DO COMPARADOR (Recepção) =====
    function setupComparador() {
        console.log('📊 Configurando Comparador-V70 para RECEPÇÃO');

        const textarea = document.getElementById('txtOperadores');
        if (!textarea) {
            console.log('❌ Textarea não encontrada');
            return;
        }

        async function receiveData(force = false) {
            if (!firebaseReady || !syncEnabled) return;

            console.log('📥 Buscando novos dados...');

            try {
                // Último timestamp recebido (em ms)
                let cursorMs = parseInt(localStorage.getItem('sync_bridge_cursorMs') || '0', 10);
                if (force) cursorMs = 0;

                // Buscar documentos mais recentes que o cursor, ordenados pelo timestamp do servidor
                const snapshot = await db.collection(CONFIG.collection)
                    .orderBy('syncedAtMs', 'asc') // Ordenar pelo timestamp local para consistência
                    .startAfter(cursorMs)
                    .limit(50)
                    .get();

                let novos = 0;
                let maxMs = cursorMs;

                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    const tsMs = data.syncedAtMs || 0;

                    // Pular se for mais antigo que o cursor (segurança extra)
                    if (tsMs <= cursorMs) continue;

                    const text = data.text || '';
                    if (!text || text.length < CONFIG.minTextLength) continue;

                    // Evitar duplicatas: verificar se o texto já está no textarea
                    if (!textarea.value.includes(text.substring(0, 100))) {
                        if (textarea.value.trim() === '') {
                            textarea.value = text;
                        } else {
                            textarea.value = textarea.value + '\n\n--- NOVO RELATÓRIO ---\n\n' + text;
                        }
                        novos++;
                    }

                    if (tsMs > maxMs) maxMs = tsMs;
                }

                if (novos > 0) {
                    console.log(`✅ ${novos} novo(s) relatório(s) recebido(s)`);
                    localStorage.setItem('sync_bridge_cursorMs', String(maxMs));
                    localStorage.setItem('comparadorLastSync', Date.now().toString()); // Para o index.html

                    // Disparar eventos para o Comparador processar
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));

                    showNotification(`📥 ${novos} novo(s) relatório(s)!`);
                } else {
                    console.log('Nenhum relatório novo encontrado.');
                }

            } catch (error) {
                console.error('❌ Erro ao receber dados:', error);
                showNotification('❌ Erro na recepção: ' + error.message, 'error');
            }
        }

        window.__syncBridgeForceReceive = () => receiveData(true);

        // Buscar a cada 5 segundos
        setInterval(receiveData, 5000);
        setTimeout(receiveData, 2000);

        console.log('✅ Comparador configurado!');
    }

    // ===== NOTIFICAÇÃO SIMPLES =====
    function showNotification(message, type = 'info') {
        // (Função mantida como estava, apenas adicionei um parâmetro type)
        const notif = document.createElement('div');
        notif.textContent = message;

        let bgColor = '#005c8f';
        if (type === 'error') bgColor = '#dc3545';
        if (type === 'success') bgColor = '#28a745';

        notif.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;

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
        // (Função mantida como estava)
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 99999;
        `;

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
            if (system === 'RDO' && window.__syncBridgeForceSend) {
                window.__syncBridgeForceSend();
            } else if (system === 'COMPARADOR' && window.__syncBridgeForceReceive) {
                window.__syncBridgeForceReceive();
            } else {
                showNotification('Sistema não identificado ou não pronto.', 'error');
            }
        };

        panel.appendChild(statusBtn);
        panel.appendChild(syncBtn);
        document.body.appendChild(panel);
    }

    // ===== INICIAR =====
    async function start() {
        console.log('🚀 Iniciando sync-bridge...');

        const fbOk = initFirebase();
        if (!fbOk) {
            console.log('❌ Falha no Firebase. Tentando novamente em 5s...');
            setTimeout(start, 5000);
            return;
        }

        // Aguarda um momento para garantir que o Firestore esteja pronto
        setTimeout(() => {
            addControlButtons();

            const system = detectSystem();
            console.log(`📌 Sistema detectado: ${system}`);

            if (system === 'RDO') {
                setupRDO();
            } else if (system === 'COMPARADOR') {
                setupComparador();
            } else {
                console.log('⏳ Sistema não identificado. Monitorando...');
                // Continua tentando detectar
                const detectInterval = setInterval(() => {
                    const newSystem = detectSystem();
                    if (newSystem !== 'UNKNOWN') {
                        clearInterval(detectInterval);
                        console.log(`📌 Sistema detectado tardiamente: ${newSystem}`);
                        if (newSystem === 'RDO') setupRDO();
                        else if (newSystem === 'COMPARADOR') setupComparador();
                    }
                }, 3000);
            }
        }, 500); // Pequeno delay
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
