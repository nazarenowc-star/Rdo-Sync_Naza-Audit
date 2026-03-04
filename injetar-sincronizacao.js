// ============================================
// INJETOR DE SINCRONIZAÇÃO - PARA AMBOS OS SISTEMAS
// ============================================

(function() {
    console.log('%c🔵 INJETOR DE SINCRONIZAÇÃO ATIVADO', 'color: #005c8f; font-size: 14px; font-weight: bold');
    console.log('📱 Verificando sistema...');
    
    // Detectar em qual página estamos
    const isRDO = document.getElementById('preview') !== null;
    const isComparador = document.getElementById('txtOperadores') !== null;
    const isIndex = document.querySelector('.cards') !== null;
    
    console.log(`📍 Página: ${isRDO ? 'RDO-Correias' : (isComparador ? 'Comparador-V70' : (isIndex ? 'Index' : 'Desconhecida'))}`);
    
    // ===== FUNÇÕES DE UTILIDADE =====
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
            console.log(`📥 Carregando: ${src.split('/').pop()}`);
        });
    }
    
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(checkInterval);
                    resolve(element);
                }
                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error(`Elemento ${selector} não encontrado`));
                }
            }, 500);
        });
    }
    
    function showStatus(message, type = 'info') {
        console.log(`[STATUS] ${message}`);
        
        // Tentar atualizar o status na página
        const statusEls = document.querySelectorAll('.status-item');
        statusEls.forEach(el => {
            if (el.textContent.includes('Comparador-V70') || el.textContent.includes('RDO-Correias')) {
                const indicator = el.querySelector('.indicator');
                const textSpan = el.querySelector('span:last-child');
                
                if (indicator) {
                    const colors = {
                        success: '#4caf50',
                        error: '#f44336',
                        warning: '#ff9800',
                        info: '#2196f3'
                    };
                    indicator.style.background = colors[type] || colors.info;
                }
                
                if (textSpan && message) {
                    textSpan.textContent = message;
                }
            }
        });
    }
    
    // ===== INICIALIZAÇÃO DO COMPARADOR-V70 =====
    async function initComparador() {
        console.log('📊 Inicializando Comparador-V70...');
        showStatus('Conectando...', 'warning');
        
        try {
            // Verificar se Firebase já existe
            if (typeof firebase === 'undefined') {
                console.log('📥 Firebase não encontrado, carregando...');
                
                // Carregar Firebase App
                await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
                console.log('✅ Firebase App carregado');
                
                // Carregar Firestore
                await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');
                console.log('✅ Firebase Firestore carregado');
                
                // Carregar configuração
                await loadScript('firebase-config.js');
                console.log('✅ Configuração carregada');
                
                // Aguardar inicialização
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Verificar se firebase foi inicializado
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                console.log('🔥 Firebase inicializado com sucesso!');
                showStatus('Conectado!', 'success');
                
                // Testar conexão
                try {
                    const test = await firebase.firestore().collection('teste').limit(1).get();
                    console.log('✅ Conexão com Firestore OK');
                } catch (e) {
                    console.warn('⚠️ Erro na conexão inicial:', e);
                }
                
                // Carregar sync-bridge
                await loadScript('sync-bridge.js');
                console.log('✅ Sync Bridge carregado');
                
                // Procurar textarea
                try {
                    const textarea = await waitForElement('#txtOperadores', 5000);
                    console.log('✅ Textarea encontrada!');
                    
                    // Disparar evento para iniciar
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                } catch (e) {
                    console.warn('⚠️ Textarea não encontrada:', e);
                }
                
            } else {
                throw new Error('Firebase não inicializado');
            }
            
        } catch (error) {
            console.error('❌ Erro no Comparador:', error);
            showStatus('Erro de conexão', 'error');
        }
    }
    
    // ===== INICIALIZAÇÃO DO RDO-CORREIAS =====
    async function initRDO() {
        console.log('📱 Inicializando RDO-Correias...');
        
        try {
            if (typeof firebase === 'undefined') {
                await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
                await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');
                await loadScript('firebase-config.js');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                console.log('🔥 Firebase OK no RDO');
                await loadScript('sync-bridge.js');
                console.log('✅ Sync Bridge carregado no RDO');
            }
            
        } catch (error) {
            console.error('❌ Erro no RDO:', error);
        }
    }
    
    // ===== INICIALIZAÇÃO DO INDEX =====
    function initIndex() {
        console.log('🏠 Inicializando Index...');
        
        // Adicionar botão de verificação
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) {
            const checkBtn = document.createElement('button');
            checkBtn.textContent = '🔍 Verificar Conexão';
            checkBtn.style.cssText = `
                background: #005c8f;
                color: white;
                border: none;
                border-radius: 20px;
                padding: 8px 16px;
                margin-top: 10px;
                cursor: pointer;
                font-size: 12px;
            `;
            
            checkBtn.onclick = async () => {
                checkBtn.textContent = '⏳ Verificando...';
                checkBtn.disabled = true;
                
                try {
                    // Tentar carregar Firebase só para testar
                    await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
                    await loadScript('firebase-config.js');
                    
                    setTimeout(() => {
                        if (typeof firebase !== 'undefined') {
                            alert('✅ Firebase OK! Conexão funcionando');
                            checkBtn.textContent = '✅ Conexão OK';
                        } else {
                            alert('❌ Firebase não carregou');
                            checkBtn.textContent = '❌ Falhou';
                        }
                    }, 2000);
                    
                } catch (e) {
                    alert('❌ Erro: ' + e.message);
                    checkBtn.textContent = '❌ Erro';
                }
                
                setTimeout(() => {
                    checkBtn.textContent = '🔍 Verificar Conexão';
                    checkBtn.disabled = false;
                }, 3000);
            };
            
            statusBar.appendChild(checkBtn);
        }
    }
    
    // ===== EXECUTAR DE ACORDO COM A PÁGINA =====
    if (isComparador) {
        initComparador();
    } else if (isRDO) {
        initRDO();
    } else if (isIndex) {
        initIndex();
    } else {
        console.log('⏳ Página não identificada, aguardando...');
        setTimeout(() => {
            // Tentar novamente após 2 segundos
            if (document.getElementById('txtOperadores')) {
                initComparador();
            } else if (document.getElementById('preview')) {
                initRDO();
            }
        }, 2000);
    }
    
    // ===== MONITORAMENTO CONTÍNUO =====
    setInterval(() => {
        if (document.getElementById('txtOperadores') && !window._syncInitialized) {
            console.log('🔄 Detectado Comparador-V70, iniciando...');
            window._syncInitialized = true;
            initComparador();
        }
    }, 3000);
    
})();