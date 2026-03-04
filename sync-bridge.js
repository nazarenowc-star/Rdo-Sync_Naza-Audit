// ============================================
// BRIDGE DE SINCRONIZAÇÃO ENTRE OS DOIS SISTEMAS
// NÃO ALTERA OS FRONTS ORIGINAIS
// ============================================

// Estado da sincronização
let lastSyncTime = null;
let syncEnabled = true;

// ===== FUNÇÕES PARA O RDO-CORREIAS =====
function injectIntoRDO() {
    console.log('🔄 Bridge: Injetando listener no RDO-Correias...');
    
    // Observar mudanças na preview (onde o texto do relatório é gerado)
    const previewElement = document.getElementById('preview');
    if (!previewElement) {
        console.log('⏳ Aguardando preview do RDO-Correias...');
        setTimeout(injectIntoRDO, 1000);
        return;
    }
    
    console.log('✅ Preview encontrado! Monitorando...');
    
    // Criar observer para detectar mudanças no preview
    const observer = new MutationObserver(async function(mutations) {
        if (!syncEnabled) return;
        
        // Debounce para não enviar muitas vezes
        clearTimeout(window._rdoDebounce);
        window._rdoDebounce = setTimeout(async () => {
            const rdoText = previewElement.textContent || previewElement.innerText;
            if (rdoText && rdoText.length > 50) { // Só enviar se tiver conteúdo significativo
                await sendToFirebase(rdoText);
            }
        }, 1500);
    });
    
    // Observar mudanças no texto
    observer.observe(previewElement, {
        childList: true,
        characterData: true,
        subtree: true,
        characterDataOldValue: true
    });
    
    // Também observar cliques em botões que geram relatório
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (btn && (btn.id === 'sendWA' || btn.id === 'copyTxt' || btn.id === 'pngBtn')) {
            setTimeout(async () => {
                const rdoText = previewElement.textContent || previewElement.innerText;
                if (rdoText && rdoText.length > 50) {
                    await sendToFirebase(rdoText);
                }
            }, 500);
        }
    });
    
    // Adicionar botão de status no RDO-Correias (sem quebrar layout)
    addStatusButton('rdo');
}

// ===== FUNÇÕES PARA O COMPARADOR-V70 =====
function injectIntoComparador() {
    console.log('🔄 Bridge: Injetando listener no Comparador-V70...');
    
    // Aguardar a textarea dos operadores
    const checkTextarea = () => {
        const textarea = document.getElementById('txtOperadores');
        if (!textarea) {
            console.log('⏳ Aguardando textarea do Comparador...');
            setTimeout(checkTextarea, 1000);
            return;
        }
        
        console.log('✅ Textarea encontrada! Monitorando Firebase...');
        
        // Inscrever para receber atualizações em tempo real
        subscribeToFirebase(textarea);
        
        // Adicionar botão de status no Comparador
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
        
        // Criar documento no Firestore
        const docRef = await db.collection(RDO_COLLECTION).add({
            text: rdoText,
            timestamp: timestamp,
            sessionId: sessionId,
            syncedAt: new Date().toISOString(),
            source: 'rdo-correias'
        });
        
        console.log('✅ Dados enviados para Firebase:', docRef.id);
        updateStatus('rdo', 'success', '✓ Sincronizado');
        
        // Limpar documentos antigos (manter só últimas 50)
        cleanupOldDocuments();
        
    } catch (error) {
        console.error('❌ Erro ao enviar para Firebase:', error);
        updateStatus('rdo', 'error', '✗ Erro');
    }
}

function subscribeToFirebase(textarea) {
    console.log('📡 Inscrevendo para atualizações do Firebase...');
    
    // Buscar última sincronização
    const lastSync = localStorage.getItem('lastComparadorSync');
    let lastSyncTime = lastSync ? new Date(lastSync) : new Date(0);
    
    // Query para últimos documentos
    const query = db.collection(RDO_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(10);
    
    // Listener em tempo real
    query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const docTime = data.timestamp?.toDate() || new Date(data.syncedAt);
                
                // Só processar se for mais recente que última sincronização
                if (docTime > lastSyncTime) {
                    console.log('📥 Novo dado recebido do Firebase:', change.doc.id);
                    
                    // Adicionar ao textarea
                    appendToTextarea(textarea, data.text);
                    
                    // Atualizar última sincronização
                    lastSyncTime = new Date();
                    localStorage.setItem('lastComparadorSync', lastSyncTime.toISOString());
                    
                    updateStatus('comparador', 'success', '✓ Atualizado');
                    
                    // Opcional: Processar automaticamente
                    setTimeout(() => {
                        if (typeof processOperadoresCompleto === 'function') {
                            processOperadoresCompleto();
                        }
                    }, 500);
                }
            }
        });
    }, (error) => {
        console.error('❌ Erro no listener Firebase:', error);
        updateStatus('comparador', 'error', '✗ Offline');
    });
}

function appendToTextarea(textarea, newText) {
    if (!textarea) return;
    
    // Pegar texto atual
    let currentText = textarea.value;
    
    // Se estiver vazio, só adicionar o novo
    if (!currentText.trim()) {
        textarea.value = newText;
        return;
    }
    
    // Verificar se já existe conteúdo similar (evitar duplicatas)
    const normalizedCurrent = currentText.replace(/\s+/g, ' ').trim();
    const normalizedNew = newText.replace(/\s+/g, ' ').trim();
    
    // Se for muito similar (90%), não adicionar
    if (similarity(normalizedCurrent, normalizedNew) > 0.9) {
        console.log('📝 Conteúdo similar ignorado');
        return;
    }
    
    // Adicionar com separador
    textarea.value = currentText + '\n\n' + newText;
    
    // Disparar evento de change para o sistema processar
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
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

async function cleanupOldDocuments() {
    try {
        // Manter apenas últimas 50 entradas
        const snapshot = await db.collection(RDO_COLLECTION)
            .orderBy('timestamp', 'desc')
            .offset(50)
            .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        if (snapshot.size > 0) {
            await batch.commit();
            console.log(`🧹 Limpeza: ${snapshot.size} documentos antigos removidos`);
        }
    } catch (error) {
        console.error('Erro na limpeza:', error);
    }
}

function similarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function addStatusButton(system) {
    // Verificar se já existe
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

// ===== INICIALIZAÇÃO =====
function init() {
    console.log('🚀 Iniciando Bridge de Sincronização...');
    
    // Detectar em qual sistema estamos
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

// Aguardar Firebase carregar
if (typeof firebase !== 'undefined') {
    init();
} else {
    // Carregar Firebase se não existir
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