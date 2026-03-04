// ============================================
// BRIDGE DE SINCRONIZAÇÃO MELHORADA
// ============================================

// Estado da sincronização
let lastSyncTime = null;
let syncEnabled = true;
let lastSentText = ''; // Para evitar duplicatas

// ===== FUNÇÕES PARA O RDO-CORREIAS =====
function injectIntoRDO() {
    console.log('🔄 Bridge: Injetando listener no RDO-Correias...');
    
    // Observar mudanças na preview
    const previewElement = document.getElementById('preview');
    if (!previewElement) {
        console.log('⏳ Aguardando preview do RDO-Correias...');
        setTimeout(injectIntoRDO, 1000);
        return;
    }
    
    console.log('✅ Preview encontrado! Monitorando...');
    
    // Função para capturar e enviar o texto
    const captureAndSend = async () => {
        if (!syncEnabled) return;
        
        const rdoText = previewElement.textContent || previewElement.innerText;
        
        // Só enviar se tiver conteúdo significativo e diferente do último
        if (rdoText && rdoText.length > 50 && rdoText !== lastSentText) {
            console.log('📤 Enviando novo relatório...');
            await sendToFirebase(rdoText);
            lastSentText = rdoText;
        }
    };
    
    // 1. Observer para mudanças no DOM
    const observer = new MutationObserver(() => {
        clearTimeout(window._rdoDebounce);
        window._rdoDebounce = setTimeout(captureAndSend, 1000);
    });
    
    observer.observe(previewElement, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true
    });
    
    // 2. Observer também no elemento pai (por segurança)
    if (previewElement.parentElement) {
        observer.observe(previewElement.parentElement, {
            childList: true,
            subtree: true
        });
    }
    
    // 3. Capturar a cada 30 segundos (backup)
    setInterval(captureAndSend, 30000);
    
    // 4. Botões que disparam relatório
    const buttons = ['sendWA', 'copyTxt', 'pngBtn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                setTimeout(captureAndSend, 500);
            });
        }
    });
    
    // 5. Inputs do checklist (mudanças nos radios)
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[type="radio"]')) {
            setTimeout(captureAndSend, 500);
        }
    });
    
    // 6. Botão de adicionar equipamento
    const addBtn = document.getElementById('addEquip');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            setTimeout(captureAndSend, 1000);
        });
    }
    
    // Adicionar botão de status
    addStatusButton('rdo');
    
    // Enviar imediatamente se já houver conteúdo
    setTimeout(captureAndSend, 2000);
}

// ===== FUNÇÕES PARA O COMPARADOR-V70 =====
function injectIntoComparador() {
    console.log('🔄 Bridge: Injetando listener no Comparador-V70...');
    
    const checkTextarea = () => {
        const textarea = document.getElementById('txtOperadores');
        if (!textarea) {
            console.log('⏳ Aguardando textarea do Comparador...');
            setTimeout(checkTextarea, 1000);
            return;
        }
        
        console.log('✅ Textarea encontrada! Monitorando Firebase...');
        
        // Inscrever para receber atualizações
        subscribeToFirebase(textarea);
        
        // Adicionar botão de força bruta
        addForceButton(textarea);
        
        // Adicionar botão de status
        addStatusButton('comparador');
    };
    
    checkTextarea();
}

// ===== FIREBASE FUNCTIONS =====
async function sendToFirebase(rdoText) {
    if (!rdoText || rdoText.trim().length < 50) return;
    
    try {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const sessionId = getSessionId();
        
        // Salvar no localStorage para saber que foi enviado
        localStorage.setItem('rdoLastSync', new Date().toISOString());
        
        const docRef = await db.collection(RDO_COLLECTION).add({
            text: rdoText,
            timestamp: timestamp,
            sessionId: sessionId,
            syncedAt: new Date().toISOString(),
            source: 'rdo-correias'
        });
        
        console.log('✅ Dados enviados para Firebase:', docRef.id);
        updateStatus('rdo', 'success', '✓ Sincronizado');
        
        // Feedback visual
        showToast('Relatório sincronizado!');
        
    } catch (error) {
        console.error('❌ Erro ao enviar para Firebase:', error);
        updateStatus('rdo', 'error', '✗ Erro');
    }
}

function subscribeToFirebase(textarea) {
    console.log('📡 Inscrevendo para atualizações do Firebase...');
    
    const lastSync = localStorage.getItem('lastComparadorSync');
    let lastSyncTime = lastSync ? new Date(lastSync) : new Date(0);
    
    const query = db.collection(RDO_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(20);
    
    query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const docTime = data.timestamp?.toDate() || new Date(data.syncedAt);
                
                if (docTime > lastSyncTime) {
                    console.log('📥 Novo dado recebido:', change.doc.id);
                    
                    // Adicionar ao textarea
                    const added = appendToTextarea(textarea, data.text);
                    
                    if (added) {
                        // Atualizar última sincronização
                        lastSyncTime = new Date();
                        localStorage.setItem('lastComparadorSync', lastSyncTime.toISOString());
                        
                        updateStatus('comparador', 'success', '✓ Atualizado');
                        showToast('Novo relatório recebido!');
                        
                        // Auto-processar após 2 segundos
                        setTimeout(() => {
                            if (typeof processOperadoresCompleto === 'function') {
                                processOperadoresCompleto();
                            }
                        }, 2000);
                    }
                }
            }
        });
    }, (error) => {
        console.error('❌ Erro no listener Firebase:', error);
        updateStatus('comparador', 'error', '✗ Offline');
    });
}

function appendToTextarea(textarea, newText) {
    if (!textarea) return false;
    
    let currentText = textarea.value;
    
    if (!currentText.trim()) {
        textarea.value = newText;
        return true;
    }
    
    // Verificar duplicatas (mais rigoroso)
    const normalizedCurrent = currentText.replace(/\s+/g, ' ').trim();
    const normalizedNew = newText.replace(/\s+/g, ' ').trim();
    
    if (normalizedCurrent.includes(normalizedNew.substring(0, 100))) {
        console.log('📝 Conteúdo similar ignorado');
        return false;
    }
    
    // Adicionar com separador
    textarea.value = currentText + '\n\n' + newText;
    
    // Disparar eventos
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
}

// ===== UTILITÁRIOS =====
function getSessionId() {
    let sessionId = localStorage.getItem('rdoSessionId');
    if (!sessionId) {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('rdoSessionId', sessionId);
    }
    return sessionId;
}

function addStatusButton(system) {
    if (document.getElementById(`sync-status-${system}`)) return;
    
    const statusDiv = document.createElement('div');
    statusDiv.id = `sync-status-${system}`;
    statusDiv.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: white;
        border: 2px solid #005c8f;
        border-radius: 30px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.3s;
    `;
    statusDiv.innerHTML = `
        <span id="sync-indicator-${system}" style="width: 12px; height: 12px; border-radius: 50%; background: #ff9800; display: inline-block;"></span>
        <span id="sync-text-${system}">Sincronizando...</span>
        <span style="margin-left: 5px; font-size: 16px;">⚡</span>
    `;
    
    statusDiv.onclick = () => {
        syncEnabled = !syncEnabled;
        updateStatus(system, syncEnabled ? 'info' : 'disabled', syncEnabled ? 'Ativo' : 'Pausado');
    };
    
    document.body.appendChild(statusDiv);
}

function addForceButton(textarea) {
    const btn = document.createElement('button');
    btn.textContent = '🔄 Forçar Sincronização';
    btn.style.cssText = `
        position: fixed;
        bottom: 70px;
        right: 10px;
        background: #005c8f;
        color: white;
        border: none;
        border-radius: 30px;
        padding: 10px 20px;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        cursor: pointer;
    `;
    
    btn.onclick = async () => {
        btn.textContent = '⏳ Buscando...';
        btn.disabled = true;
        
        try {
            // Buscar últimos 5 documentos
            const snapshot = await db.collection(RDO_COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();
            
            let count = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (appendToTextarea(textarea, data.text)) {
                    count++;
                }
            });
            
            btn.textContent = `✅ ${count} novos adicionados`;
            setTimeout(() => {
                btn.textContent = '🔄 Forçar Sincronização';
                btn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error(error);
            btn.textContent = '❌ Erro';
            setTimeout(() => {
                btn.textContent = '🔄 Forçar Sincronização';
                btn.disabled = false;
            }, 2000);
        }
    };
    
    document.body.appendChild(btn);
}

function updateStatus(system, type, message) {
    const indicator = document.getElementById(`sync-indicator-${system}`);
    const text = document.getElementById(`sync-text-${system}`);
    
    if (!indicator || !text) return;
    
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        info: '#ff9800',
        disabled: '#9e9e9e'
    };
    
    indicator.style.background = colors[type] || colors.info;
    text.textContent = message;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 130px;
        right: 10px;
        background: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 30px;
        font-size: 12px;
        z-index: 9999;
        animation: fadeInOut 3s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== INICIALIZAÇÃO =====
function init() {
    console.log('🚀 Iniciando Bridge de Sincronização Melhorada...');
    
    if (document.getElementById('preview')) {
        console.log('📱 Sistema detectado: RDO-Correias');
        injectIntoRDO();
    } else if (document.getElementById('txtOperadores')) {
        console.log('📊 Sistema detectado: Comparador-V70');
        injectIntoComparador();
    } else {
        console.log('⏳ Aguardando detecção do sistema...');
        setTimeout(init, 1000);
    }
}

// Aguardar Firebase
if (typeof firebase !== 'undefined') {
    init();
} else {
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
    script.onload = () => {
        const firestore = document.createElement('script');
        firestore.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js';
        firestore.onload = init;
        document.head.appendChild(firestore);
    };
    document.head.appendChild(script);
}
