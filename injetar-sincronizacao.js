// ============================================
// INJETOR DE SINCRONIZAÇÃO - VERSÃO SIMPLIFICADA
// ============================================

(function() {
    console.log('%c🔵 INJETOR DE SINCRONIZAÇÃO ATIVADO', 'color: #005c8f; font-size: 14px; font-weight: bold');

    const scriptsToLoad = [
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
        'firebase-config.js', // Este deve estar no mesmo diretório
        'sync-bridge.js'       // Este deve estar no mesmo diretório
    ];

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // Evita carregar o mesmo script duas vezes
            if (document.querySelector(`script[src="${src}"]`)) {
                console.log(`⏩ Script já carregado: ${src}`);
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`✅ Script carregado: ${src}`);
                resolve();
            };
            script.onerror = (err) => {
                console.error(`❌ Erro ao carregar script: ${src}`, err);
                reject(err);
            };
            document.head.appendChild(script);
        });
    }

    async function loadAllScripts() {
        console.log('📥 Iniciando carga dos scripts de sincronização...');
        for (const src of scriptsToLoad) {
            try {
                await loadScript(src);
                // Pequeno delay entre carregamentos para não sobrecarregar
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {
                console.error(`Falha ao carregar ${src}. O sistema pode não funcionar.`);
            }
        }
        console.log('🎉 Processo de injeção concluído.');
    }

    // Iniciar o carregamento quando a página estiver pronta
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAllScripts);
    } else {
        loadAllScripts();
    }
})();
