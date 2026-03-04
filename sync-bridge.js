// ============================================
// BRIDGE DE SINCRONIZAÇÃO - VERSÃO COM LOG CORRETO
// ============================================

// Configurações
const CONFIG = {
    COLECTION: 'rdo_operadores',
    CHECK_INTERVAL: 5000,
    RETRY_INTERVAL: 3000,
    MIN_TEXT_LENGTH: 20
};

// Estado
let syncEnabled = true;
let firebaseReady = false;
let lastSendTime = 0;
let lastTextHash = '';

// ===== LOG PANEL CORRIGIDO - CANTO INFERIOR DIREITO =====
function addLogPanel() {
    if (document.getElementById('sync-log-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'sync-log-panel';
    panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        max-height: 400px;
        background: white;
        border: 2px solid #005c8f;
        border-radius: 12px;
        padding: 12px;
        font-family: monospace;
        font-size: 11px;
        z-index: 999999;
        box-shadow: 0 5px 25px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        resize: both;
        overflow: hidden;
    `;
    
    panel.innerHTML = `
        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #005c8f;
            cursor: move;
            background: white;
        " id="sync-drag-handle">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight:bold; color:#005c8f; font-size:13px;">📡 LOG DE SINCRONIZAÇÃO</span>
                <span id="sync-connection-status" style="color:#ff9800; font-size:10px;">● CONECTANDO</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button id="sync-minimize-btn" style="background:none; border:none; cursor:pointer; font-size:16px;">🗕</button>
                <button id="sync-close-btn" style="background:none; border:none; cursor:pointer; font-size:16px;">✕</button>
            </div>
        </div>
        
        <div id="sync-log-messages" style="
            flex: 1;
            min-height: 200px;
            max-height: 300px;
            overflow-y: auto;
            background: #f8f9fa;
            padding: 8px;
            border-radius: 8px;
            font-size: 11px;
            line-height: 1.5;
            border: 1px solid #dee2e6;
        "></div>
        
        <div style="
            display: flex;
            gap: 8px;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #dee2e6;
        ">
            <button id="sync-reset-btn" style="
                flex: 1;
                background: #005c8f;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
            ">⟲ RESET</button>
            
            <button id="sync-test-btn" style="
                flex: 1;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
            ">🔍 TESTAR</button>
            
            <button id="sync-clear-btn" style="
                flex: 0.5;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
            ">🗑️</button>
        </div>
        
        <div style="
            margin-top: 5px;
            font-size: 9px;
            color: #6c757d;
            text-align: right;
        " id="sync-last-update"></div>
    `;
    
    document.body.appendChild(panel);
    
    // Tornar arrastável
    makeDraggable(panel);
    
    // Botões
    document.getElementById('sync-reset-btn').onclick = () => {
        logMessage('🔄 Reset manual...', 'warning');
        localStorage.removeItem('firebase_initialized');
        setTimeout(() => window.location.reload(), 1000);
    };
    
    document.getElementById('sync-test-btn').onclick = testConnection;
    
    document.getElementById('sync-clear-btn').onclick = () => {
        document.getElementById('sync-log-messages').innerHTML = '';
        logMessage('🧹 Log limpo', 'info');
    };
    
    document.getElementById('sync-close-btn').onclick = () => {
        panel.style.display = 'none';
    };
    
    document.getElementById('sync-minimize-btn').onclick = () => {
        const messages = document.getElementById('sync-log-messages');
        const isMinimized = messages.style.display === 'none';
        messages.style.display = isMinimized ? 'block' : 'none';
        document.getElementById('sync-minimize-btn').textContent = isMinimized ? '🗕' : '🗖';
    };
}

// Função para tornar o painel arrastável
function makeDraggable(element) {
    const handle = document.getElementById('sync-drag-handle');
    let isDragging = false;
    let offsetX, offsetY;
    
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        element.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        
        // Limites da janela
        newX = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, newX));
        newY = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, newY));
        
        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        element.style.cursor = 'default';
    });
}

function logMessage(msg, type = 'info') {
    const logDiv = document.getElementById('sync-log-messages');
    if (!logDiv) return;
    
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const colors = {
        info: '#0066cc',
        success: '#28a745',
        error: '#dc3545',
        warning: '#ff9800',
        send: '#005c8f',
        receive: '#8B4513'
    };
    
    const icons = {
        info: '📌',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        send: '📤',
        receive: '📥'
    };
    
    const entry = document.createElement('div');
    entry.style.cssText = `
        margin: 3px 0;
        padding: 4px 6px;
        border-radius: 4px;
        background: ${type === 'error' ? '#fff5f5' : 'transparent'};
        border-left: 3px solid ${colors[type] || colors.info};
        color: #1a1a1a;
        word-break: break-word;
        font-size: 11px;
        transition: all 0.2s;
    `;
    
    entry.innerHTML = `
        <span style="color: #666; font-size: 10px;">[${time}]</span>
        <span style="margin-left: 4px;">${icons[type] || ''}</span>
        <span style="margin-left: 4px;">${msg}</span>
    `;
    
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
    
    // Atualizar timestamp
    const lastUpdate = document.getElementById('sync-last-update');
    if (lastUpdate) {
        lastUpdate.textContent = `Última atividade: ${time}`;
    }
    
    console.log(`[SYNC] ${msg}`);
}

function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('sync-connection-status');
    if (!statusEl) return;
    
    const colors = {
        connected: '#28a745',
        connecting: '#ff9800',
        error: '#dc3545',
        disabled: '#999',
        sending: '#005c8f',
        receiving: '#8B4513'
    };
    
    statusEl.style.color = colors[status] || colors.connecting;
    statusEl.innerHTML = `● ${message || status.toUpperCase()}`;
}

// ===== TESTE DE CONEXÃO =====
async function testConnection() {
    logMessage('🔍 Testando conexão...', 'info');
    updateConnectionStatus('connecting', 'TESTANDO');
    
    if (!firebaseReady || !window.firebase) {
        logMessage('❌ Firebase não está pronto', 'error');
        updateConnectionStatus('error', 'ERRO');
        return false;
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
    logMessage('📱 Inicializando RDO-Correias...', 'info');
    
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
            logMessage('✅ Preview encontrado!', 'success');
            setupRDOMonitor(preview);
        } else if (attempts > 20) {
            clearInterval(waitForPreview);
            logMessage('❌ Preview não encontrado', 'error');
        }
    }, 1000);
}

function setupRDOMonitor(previewElement) {
    logMessage('🔍 Configurando monitores...', 'info');
    
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
        
        // Evitar spam (mínimo 3 segundos entre envios)
        const now = Date.now();
        if (now - lastSendTime < 3000) {
            return;
        }
        
        lastSendTime = now;
        
        // Mostrar preview do que está enviando
        const preview = text.split('\n')[0].substring(0, 60) + '...';
        logMessage(`📤 Enviando: "${preview}"`, 'send');
        updateConnectionStatus('sending', 'ENVIANDO');
        
        try {
            await sendToFirebase(text);
            logMessage('✅ Enviado com sucesso!', 'success');
            updateConnectionStatus('connected', 'CONECTADO');
        } catch (error) {
            logMessage(`❌ Erro no envio: ${error.message}`, 'error');
            updateConnectionStatus('error', 'ERRO');
        }
    };
    
    // Observer
    const observer = new MutationObserver(() => {
        clearTimeout(window.sendTimeout);
        window.sendTimeout = setTimeout(sendCurrentText, 1500);
    });
    
    observer.observe(previewElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    
    // Intervalo regular
    setInterval(() => {
        if (syncEnabled) {
            logMessage('⏰ Envio periódico...', 'info');
            sendCurrentText();
        }
    }, 10000);
    
    logMessage('✅ Monitores configurados!', 'success');
}

async function sendToFirebase(text) {
    if (!firebaseReady || !window.firebase) {
        throw new Error('Firebase não disponível');
    }
    
    const db = firebase.firestore();
    
    // Extrair data
    const dataMatch = text.match(/Data:\s*(\d{4}-\d{2}-\d{2})/);
    const data = dataMatch ? dataMatch[1] : new Date().toISOString().split('T')[0];
    
    const docData = {
        text: text,
        data: data,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        syncedAt: new Date().toISOString()
    };
    
    const docRef = await db.collection(CONFIG.COLECTION).add(docData);
    localStorage.setItem('rdoLastSync', new Date().toISOString());
    
    return docRef;
}

// ===== FUNÇÕES PARA COMPARADOR-V70 =====
async function initComparador() {
    logMessage('📊 Inicializando Comparador-V70...', 'info');
    
    const fbReady = await ensureFirebase();
    if (!fbReady) return;
    
    let attempts = 0;
    const waitForTextarea = setInterval(() => {
        const textarea = document.getElementById('txtOperadores');
        attempts++;
        
        if (textarea) {
            clearInterval(waitForTextarea);
            logMessage('✅ Textarea encontrada!', 'success');
            setupComparadorListener(textarea);
        } else if (attempts > 20) {
            clearInterval(waitForTextarea);
            logMessage('❌ Textarea não encontrada', 'error');
        }
    }, 1000);
}

function setupComparadorListener(textarea) {
    logMessage('🔍 Configurando listener do Firebase...', 'info');
    
    let lastSyncTime = localStorage.getItem('lastComparadorSync') 
        ? new Date(localStorage.getItem('lastComparadorSync')) 
        : new Date(0);
    
    // Listener em tempo real
    const db = firebase.firestore();
    db.collection(CONFIG.COLECTION)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const docTime = data.timestamp?.toDate() || new Date(data.syncedAt);
                    
                    if (docTime > lastSyncTime) {
                        logMessage('📨 Novo relatório recebido!', 'receive');
                        updateConnectionStatus('receiving', 'RECEBENDO');
                        
                        if (appendToTextarea(textarea, data.text)) {
                            lastSyncTime = new Date();
                            localStorage.setItem('lastComparadorSync', lastSyncTime.toISOString());
                            
                            setTimeout(() => {
                                updateConnectionStatus('connected', 'CONECTADO');
                            }, 2000);
                        }
                    }
                }
            });
        }, (error) => {
            logMessage(`❌ Erro no listener: ${error.message}`, 'error');
        });
}

function appendToTextarea(textarea, newText) {
    if (!textarea) return false;
    
    const currentText = textarea.value;
    
    // Anti-duplicata básico
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
    
    textarea.scrollTop = textarea.scrollHeight;
    
    return true;
}

// ===== INICIALIZAÇÃO DO FIREBASE =====
async function ensureFirebase() {
    return new Promise((resolve) => {
        if (window.firebase && window.firebase.firestore && firebase.apps.length > 0) {
            logMessage('✅ Firebase já disponível', 'success');
            firebaseReady = true;
            updateConnectionStatus('connected', 'CONECTADO');
            resolve(true);
            return;
        }
        
        logMessage('⏳ Aguardando Firebase...', 'info');
        
        // Tentar por 10 segundos
        let attempts = 0;
        const checkFirebase = setInterval(() => {
            attempts++;
            
            if (window.firebase && window.firebase.firestore && firebase.apps.length > 0) {
                clearInterval(checkFirebase);
                logMessage('✅ Firebase disponível', 'success');
                firebaseReady = true;
                updateConnectionStatus('connected', 'CONECTADO');
                resolve(true);
            } else if (attempts > 20) {
                clearInterval(checkFirebase);
                logMessage('❌ Firebase não disponível', 'error');
                updateConnectionStatus('error', 'ERRO');
                resolve(false);
            }
        }, 500);
    });
}

// ===== INICIALIZAÇÃO =====
function init() {
    console.clear();
    console.log('%c🔵 SISTEMA DE SINCRONIZAÇÃO', 'color: #005c8f; font-size: 16px; font-weight: bold');
    
    // Adicionar painel de log NO CANTO INFERIOR DIREITO
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

// Iniciar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
