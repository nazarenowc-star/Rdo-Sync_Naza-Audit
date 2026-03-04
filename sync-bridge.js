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
        
        // Função de enviar
        async function sendData() {
            if (!firebaseReady || !syncEnabled) return;
            
            const text = preview.textContent || preview.innerText;
            if (!text || text.length < CONFIG.minTextLength) return;
            
            // Evitar spam
            const now = Date.now();
            if (now - lastSendTime < 5000) return;
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
                    source: 'rdo'
                });
                
                console.log('✅ Dados enviados com sucesso!');
                localStorage.setItem('lastSendTime', new Date().toISOString());
                
                // Feedback visual
                showNotification('📤 Dados sincronizados!');
                
            } catch (error) {
                console.error('❌ Erro ao enviar:', error);
            }
        }
        
        // Observar mudanças
        const observer = new MutationObserver(() => {
            clearTimeout(window.sendTimeout);
            window.sendTimeout = setTimeout(sendData, 2000);
        });
        
        observer.observe(preview, {
            childList: true,
            characterData: true,
            subtree: true
        });
        
        // Enviar a cada 10 segundos
        setInterval(sendData, 10000);
        
        // Enviar agora
        setTimeout(sendData, 3000);
        
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
        
        // Função de receber dados
        async function receiveData() {
            if (!firebaseReady || !syncEnabled) return;
            
            console.log('📥 Buscando novos dados...');
            
            try {
                const db = firebase.firestore();
                
                const snapshot = await db.collection(CONFIG.collection)
                    .orderBy('timestamp', 'desc')
                    .limit(5)
                    .get();
                
                let novos = 0;
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const dataTime = data.timestamp?.toDate() || new Date(data.syncedAt);
                    
                    if (dataTime > new Date(lastReceiveTime)) {
                        const text = data.text;
                        
                        // Verificar se já tem no textarea
                        if (!textarea.value.includes(text.substring(0, 100))) {
                            if (textarea.value.trim()) {
                                textarea.value += '\n\n--- NOVO RELATÓRIO ---\n\n' + text;
                            } else {
                                textarea.value = text;
                            }
                            novos++;
                        }
                    }
                });
                
                if (novos > 0) {
                    console.log(`✅ ${novos} novo(s) relatório(s) recebido(s)`);
                    lastReceiveTime = new Date().toISOString();
                    localStorage.setItem('lastSyncTime', lastReceiveTime);
                    
                    // Disparar eventos
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Processar automaticamente
                    setTimeout(() => {
                        if (typeof processOperadoresCompleto === 'function') {
                            console.log('⚙️ Processando dados...');
                            processOperadoresCompleto();
                        }
                    }, 2000);
                    
                    showNotification(`📥 ${novos} novo(s) relatório(s)!`);
                }
                
            } catch (error) {
                console.error('❌ Erro ao receber:', error);
            }
        }
        
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
                const preview = document.getElementById('preview');
                if (preview) {
                    const text = preview.textContent;
                    console.log('📤 Forçando envio manual...');
                    // Disparar envio
                }
            } else if (system === 'COMPARADOR') {
                console.log('📥 Forçando busca manual...');
                // Disparar busca
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
