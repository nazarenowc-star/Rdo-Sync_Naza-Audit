// ============================================
// BRIDGE DE SINCRONIZAÇÃO - VERSÃO ULTRA-ESTÁVEL
// ============================================

// Configurações
const CONFIG = {
    COLECTION: 'rdo_operadores',
    CHECK_INTERVAL: 5000, // 5 segundos
    RETRY_INTERVAL: 3000,  // 3 segundos
    MAX_RETRIES: 999999,    // infinito
    MIN_TEXT_LENGTH: 20
};

// Estado
let syncEnabled = true;
let firebaseReady = false;
let retryCount = 0;
let lastSendTime = 0;
let lastTextHash = '';

// ===== LOG VISÍVEL =====
function addLogPanel() {
    if (document.getElementById('sync-log-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'sync-log-panel';
    panel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 300px;
        max-height: 400px;
        overflow-y: auto;
        background: white;
        border: 3px solid #005c8f;
        border-radius: 10px;
        padding: 10px;
        font-family: monospace;
        font-size: 11px;
        z-index: 10000;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    `;
    
    panel.innerHTML = `
        <div style="font-weight:bold; color:#005c8f; margin-bottom:8px; display:flex; justify-content:space-between">
            <span>📡 LOG DE SINCRONIZAÇÃO</span>
            <span id="sync-connection-status" style="color:#ff9800">● CONECTANDO</span>
        </div>
        <div id="sync-log-messages" style="height:300px; overflow-y:auto; background:#f5f5f5; padding:5px; border-radius:5px"></div>
        <div style="margin-top:8px; display:flex; gap:5px">
            <button id="sync-reset-btn" style="flex:1; background:#005c8f; color:white; border:none; border-radius:5px; padding:5px; cursor:pointer">⟲ RESET</button>
            <button id="sync-test-btn" style="flex:1; background:#28a745; color:white; border:none; border-radius:5px; padding:5px; cursor:pointer">🔍 TESTAR</button>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Botão de reset
    document.getElementById('sync-reset-btn').onclick = () => {
        logMessage('🔄 Reset manual...');
        localStorage.removeItem('firebase_initialized');
        setTimeout(() => window.location.reload(), 1000);
    };
    
    // Botão de teste
    document.getElementById('sync-test-btn').onclick = testConnection;
}

function logMessage(msg, type = 'info') {
    const logDiv = document.getElementById('sync-log-messages');
    if (!logDiv) return;
    
    const time = new Date().toLocaleTimeString();
    const colors = {
        info: '#0066cc',
        success: '#28a745',
        error: '#dc3545',
        warning: '#ff9800'
    };
    
    const entry = document.createElement('div');
    entry.style.cssText = `
        margin: 2px 0;
        padding: 2px;
        border-bottom: 1px solid #eee;
        color: ${colors[type] || '#333'};
    `;
    entry.textContent = `[${time}] ${msg}`;
    
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
    
    console.log(`[SYNC] ${msg}`);
}

function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('sync-connection-status');
    if (!statusEl) return;
    
    const colors = {
        connected: '#28a745',
        connecting: '#ff9800',
        error: '#dc3545',
        disabled: '#999'
    };
    
    statusEl.style.color = colors[status] || '#ff9800';
    statusEl.textContent = `● ${message || status.toUpperCase()}`;
}

// ===== VERIFICAÇÃO DO FIREBASE =====
async function ensureFirebase() {
    return new Promise((resolve) => {
        // Se já está pronto
        if (window.firebase && window.firebase.firestore) {
            logMessage('✅ Firebase já disponível');
            firebaseReady = true;
            updateConnectionStatus('connected', 'CONECTADO');
            resolve(true);
            return;
        }
        
        logMessage('⏳ Aguardando Firebase...');
        
        // Carregar Firebase se necessário
        const loadFirebase = () => {
            if (document.querySelector('script[src*="firebase"]')) {
                logMessage('⏳ Firebase carregando...');
                setTimeout(() => {
                    if (window.firebase) {
                        logMessage('✅ Firebase carregado');
                        firebaseReady = true;
                        updateConnectionStatus('connected', 'CONECTADO');
                        resolve(true);
                    } else {
                        retryCount++;
                        if (retryCount < 10) {
                            logMessage(`⏳ Tentativa ${retryCount}/10...`);
                            setTimeout(loadFirebase, 2000);
                        } else {
                            logMessage('❌ Firebase não carregou', 'error');
                            updateConnectionStatus('error', 'ERRO');
                            resolve(false);
                        }
                    }
                }, 2000);
            } else {
                logMessage('📥 Carregando Firebase...');
                const script = document.createElement('script');
                script.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
                script.onload = () => {
                    const firestore = document.createElement('script');
                    firestore.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js';
                    firestore.onload = () => {
                        logMessage('✅ Firebase scripts carregados');
                        setTimeout(loadFirebase, 500);
                    };
                    document.head.appendChild(firestore);
                };
                document.head.appendChild(script);
            }
        };
        
        loadFirebase();
    });
}

// ===== TESTE DE CONEXÃO =====
async function testConnection() {
    logMessage('🔍 Testando conexão...', 'info');
    
    if (!firebaseReady || !window.firebase) {
        logMessage('❌ Firebase não está pronto', 'error');
        return;
    }
    
    try {
        const testDoc = await firebase.firestore()
            .collection(CONFIG.COLECTION)
            .limit(1)
            .get();
        
        logMessage(`✅ Conexão OK! ${testDoc.size} documentos encontrados`, 'success');
        updateConnectionStatus('connected', 'CONECTADO');
        return true;
    } catch (error) {
        logMessage(`❌ Erro de conexão: ${error.message}`, 'error');
        updateConnectionStatus('error', 'ERRO');
        return false;
    }
}

// ===== FUNÇÕES PARA RDO-CORREIAS =====
async function initRDO() {
    logMessage('📱 Inicializando RDO-Correias...');
    
    // Aguardar Firebase
    const fbReady = await ensureFirebase();
    if (!fbReady) {
        logMessage('❌ Falha ao inicializar Firebase', 'error');
        return;
    }
    
    // Aguardar preview
    let attempts = 0;
    const waitForPreview = setInterval(() => {
        const preview = document.getElementById('preview');
        attempts++;
        
        if (preview) {
            clearInterval(waitForPreview);
            logMessage('✅ Preview encontrado!');
            setupRDOMonitor(preview);
        } else if (attempts > 20) {
            clearInterval(waitForPreview);
            logMessage('❌ Preview não encontrado', 'error');
        }
    }, 1000);
}

function setupRDOMonitor(previewElement) {
    logMessage('🔍 Configurando monitores...');
    
    // Função de envio
    const sendCurrentText = async () => {
        if (!syncEnabled) {
            logMessage('⏸️ Sincronização pausada', 'warning');
            return;
        }
        
        const text = previewElement.textContent || previewElement.innerText;
        
        if (!text || text.length < CONFIG.MIN_TEXT_LENGTH) {
            logMessage('📝 Texto muito curto, ignorando', 'info');
            return;
        }
        
        // Gerar hash simples para log
        const hash = text.substring(0, 50).replace(/\s+/g, ' ');
        
        // Evitar spam (mínimo 2 segundos entre envios)
        const now = Date.now();
        if (now - lastSendTime < 2000) {
            logMessage('⏳ Aguardando intervalo entre envios...', 'info');
            return;
        }
        
        lastSendTime = now;
        logMessage(`📤 Enviando: "${hash}..."`, 'info');
        
        try {
            await sendToFirebase(text);
            logMessage('✅ Enviado com sucesso!', 'success');
        } catch (error) {
            logMessage(`❌ Erro no envio: ${error.message}`, 'error');
        }
    };
    
    // 1. Observer
    const observer = new MutationObserver(() => {
        clearTimeout(window.sendTimeout);
        window.sendTimeout = setTimeout(sendCurrentText, 1000);
    });
    
    observer.observe(previewElement, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true
    });
    
    // 2. Intervalo regular (a cada 10 segundos)
    setInterval(() => {
        if (syncEnabled) {
            logMessage('⏰ Envio periódico...');
            sendCurrentText();
        }
    }, 10000);
    
    // 3. Botões
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && ['sendWA', 'copyTxt', 'pngBtn', 'addEquip'].some(id => btn.id === id)) {
            logMessage(`🖱️ Botão ${btn.id} clicado`);
            setTimeout(sendCurrentText, 500);
        }
    });
    
    // 4. Inputs
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[type="radio"]')) {
            logMessage(`📻 Radio changed: ${e.target.name}`);
            setTimeout(sendCurrentText, 300);
        }
    });
    
    // 5. Envio inicial
    setTimeout(sendCurrentText, 2000);
    
    logMessage('✅ Monitores configurados!');
}

async function sendToFirebase(text) {
    if (!firebaseReady || !window.firebase) {
        throw new Error('Firebase não disponível');
    }
    
    const db = firebase.firestore();
    
    // Extrair data do texto
    const dataMatch = text.match(/Data:\s*(\d{4}-\d{2}-\d{2})/);
    const data = dataMatch ? dataMatch[1] : new Date().toISOString().split('T')[0];
    
    // Extrair equipamentos
    const equipMatch = text.match(/🎯\s*([^\n]+)/g) || [];
    const equipamentos = equipMatch.map(e => e.replace('🎯', '').trim());
    
    const docData = {
        text: text,
        data: data,
        equipamentos: equipamentos,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        syncedAt: new Date().toISOString(),
        device: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        userAgent: navigator.userAgent.substring(0, 100)
    };
    
    const docRef = await db.collection(CONFIG.COLECTION).add(docData);
    localStorage.setItem('rdoLastSync', new Date().toISOString());
    
    return docRef;
}

// ===== FUNÇÕES PARA COMPARADOR-V70 =====
async function initComparador() {
    logMessage('📊 Inicializando Comparador-V70...');
    
    const fbReady = await ensureFirebase();
    if (!fbReady) return;
    
    let attempts = 0;
    const waitForTextarea = setInterval(() => {
        const textarea = document.getElementById('txtOperadores');
        attempts++;
        
        if (textarea) {
            clearInterval(waitForTextarea);
            logMessage('✅ Textarea encontrada!');
            setupComparadorListener(textarea);
        } else if (attempts > 20) {
            clearInterval(waitForTextarea);
            logMessage('❌ Textarea não encontrada', 'error');
        }
    }, 1000);
}

function setupComparadorListener(textarea) {
    logMessage('🔍 Configurando listener do Firebase...');
    
    let lastSyncTime = localStorage.getItem('lastComparadorSync') 
        ? new Date(localStorage.getItem('lastComparadorSync')) 
        : new Date(0);
    
    // Função para buscar novos documentos
    const fetchNewData = async () => {
        if (!firebaseReady) return;
        
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(CONFIG.COLECTION)
                .where('timestamp', '>', lastSyncTime)
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            
            if (!snapshot.empty) {
                logMessage(`📥 ${snapshot.size} novo(s) documento(s)`);
                
                let added = 0;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (appendToTextarea(textarea, data.text)) {
                        added++;
                    }
                });
                
                if (added > 0) {
                    logMessage(`✅ ${added} relatório(s) adicionado(s)`, 'success');
                    lastSyncTime = new Date();
                    localStorage.setItem('lastComparadorSync', lastSyncTime.toISOString());
                    
                    // Auto-processar
                    setTimeout(() => {
                        if (typeof processOperadoresCompleto === 'function') {
                            logMessage('⚙️ Processando automaticamente...');
                            processOperadoresCompleto();
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            logMessage(`❌ Erro ao buscar: ${error.message}`, 'error');
        }
    };
    
    // Listener em tempo real
    const db = firebase.firestore();
    db.collection(CONFIG.COLECTION)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const docTime = data.timestamp?.toDate() || new Date(data.syncedAt);
                    
                    if (docTime > lastSyncTime) {
                        logMessage(`📨 Novo documento em tempo real`);
                        if (appendToTextarea(textarea, data.text)) {
                            lastSyncTime = new Date();
                            localStorage.setItem('lastComparadorSync', lastSyncTime.toISOString());
                        }
                    }
                }
            });
        }, (error) => {
            logMessage(`❌ Erro no listener: ${error.message}`, 'error');
        });
    
    // Buscar a cada 10 segundos
    setInterval(fetchNewData, 10000);
    
    // Buscar imediatamente
    setTimeout(fetchNewData, 2000);
    
    // Adicionar botão de busca manual
    addManualFetchButton(textarea);
}

function appendToTextarea(textarea, newText) {
    if (!textarea) return false;
    
    const currentText = textarea.value;
    
    // Verificar se já existe (anti-duplicata básico)
    if (currentText.includes(newText.substring(0, 100))) {
        logMessage('📝 Conteúdo já existe, ignorando', 'info');
        return false;
    }
    
    if (!currentText.trim()) {
        textarea.value = newText;
    } else {
        textarea.value = currentText + '\n\n--- NOVO RELATÓRIO ---\n\n' + newText;
    }
    
    // Disparar eventos
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Rolar para o final
    textarea.scrollTop = textarea.scrollHeight;
    
    return true;
}

function addManualFetchButton(textarea) {
    const btn = document.createElement('button');
    btn.textContent = '🔄 BUSCAR RELATÓRIOS';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #005c8f;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 15px 25px;
        font-size: 16px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        cursor: pointer;
        animation: pulse 2s infinite;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); background: #0077b3; }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
    
    btn.onclick = async () => {
        btn.textContent = '⏳ BUSCANDO...';
        btn.disabled = true;
        
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(CONFIG.COLECTION)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();
            
            let count = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (appendToTextarea(textarea, data.text)) {
                    count++;
                }
            });
            
            btn.textContent = `✅ ${count} ENCONTRADOS`;
            setTimeout(() => {
                btn.textContent = '🔄 BUSCAR RELATÓRIOS';
                btn.disabled = false;
            }, 3000);
            
        } catch (error) {
            btn.textContent = '❌ ERRO';
            setTimeout(() => {
                btn.textContent = '🔄 BUSCAR RELATÓRIOS';
                btn.disabled = false;
            }, 3000);
        }
    };
    
    document.body.appendChild(btn);
}

// ===== INICIALIZAÇÃO =====
function init() {
    console.clear();
    console.log('%c🔵 SISTEMA DE SINCRONIZAÇÃO ULTRA-ESTÁVEL', 'color: #005c8f; font-size: 16px; font-weight: bold');
    
    // Adicionar painel de log
    addLogPanel();
    
    // Detectar sistema
    if (document.getElementById('preview')) {
        logMessage('📱 SISTEMA: RDO-Correias');
        initRDO();
    } else if (document.getElementById('txtOperadores')) {
        logMessage('📊 SISTEMA: Comparador-V70');
        initComparador();
    } else {
        logMessage('❓ Sistema não identificado, aguardando...');
        setTimeout(init, 2000);
    }
}

// Iniciar quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
