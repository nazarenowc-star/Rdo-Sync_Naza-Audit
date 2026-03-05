<!-- ============================================ -->
<!-- ARQUIVO: rdo-sync.js (Salve na mesma pasta) -->
<!-- ============================================ -->
<script type="module">
// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDEotosWG9ss-pMDbZluy5Dg_bOfG8kHJQ",
  authDomain: "rdo-sync.firebaseapp.com",
  projectId: "rdo-sync",
  storageBucket: "rdo-sync.firebasestorage.app",
  messagingSenderId: "551344630048",
  appId: "1:551344630048:web:87e485e712473a46234f45"
};

// Import Firebase (via CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  deleteDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// Inicializar
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// SISTEMA DE SINCRONIZAÇÃO EM TEMPO REAL
// ==========================================

class RdoSync {
  constructor() {
    this.listeners = new Map();
    this.currentRdoId = null;
    this.isSyncing = false;
  }

  // GERAR ID ÚNICO PARA O RDO
  generateRdoId() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const turno = localStorage.getItem('rdo_turno') || 'X';
    return `rdo_${dateStr}_${turno}_${now.getTime()}`;
  }

  // ==========================================
  // MODO 1: RDO-MULTI (Operador digitando)
  // ==========================================
  
  // Salvar dados em tempo real enquanto digita
  async syncFromRdoMulti(equipData) {
    if (this.isSyncing) return;
    
    const rdoId = this.currentRdoId || this.generateRdoId();
    this.currentRdoId = rdoId;
    
    // Salvar no Firestore em tempo real
    const rdoRef = doc(db, 'rdos_ativos', rdoId);
    await setDoc(rdoRef, {
      ...equipData,
      timestamp: serverTimestamp(),
      lastUpdate: Date.now(),
      source: 'rdo-multi',
      status: 'em_edicao'
    }, { merge: true });
    
    return rdoId;
  }

  // ==========================================
  // MODO 2: COMPARADOR (Recebendo dados)
  // ==========================================

  // Escutar mudanças em tempo real
  listenToActiveRdos(callback) {
    const q = query(
      collection(db, 'rdos_ativos'),
      orderBy('lastUpdate', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          callback(data, change.doc.id);
        }
      });
    });
    
    this.listeners.set('activeRdos', unsubscribe);
    return unsubscribe;
  }

  // ==========================================
  // FINALIZAR RDO
  // ==========================================
  
  async finalizeRdo(rdoId, finalData) {
    // Mover para histórico
    const batch = writeBatch(db);
    
    const activeRef = doc(db, 'rdos_ativos', rdoId);
    const historyRef = doc(db, 'rdos_historico', rdoId);
    
    batch.set(historyRef, {
      ...finalData,
      finalizedAt: serverTimestamp(),
      status: 'finalizado'
    });
    
    batch.delete(activeRef);
    
    await batch.commit();
    this.currentRdoId = null;
  }

  // Limpar listeners
  cleanup() {
    this.listeners.forEach(unsub => unsub());
    this.listeners.clear();
  }
}

// Instância global
window.rdoSync = new RdoSync();

// ==========================================
// DETECTOR DE PÁGINA E AUTO-CONFIGURAÇÃO
// ==========================================

const currentPage = window.location.pathname;

// Se estiver no RDO-Multi (operador digitando)
if (currentPage.includes('Correias-RDO-multi') || document.querySelector('#grid')) {
  console.log('🔵 Modo RDO-Multi detectado - Ativando sincronização em tempo real');
  
  // Interceptar mudanças nos equipamentos
  const originalRender = window.render;
  let syncTimeout;
  
  // Observar mudanças no DOM dos cards
  const observer = new MutationObserver(() => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      const equipData = collectRdoMultiData();
      if (equipData.equipamentos.length > 0) {
        window.rdoSync.syncFromRdoMulti(equipData);
      }
    }, 500); // Debounce de 500ms
  });
  
  // Iniciar observação quando o grid existir
  const startObserving = () => {
    const grid = document.querySelector('#grid');
    if (grid) {
      observer.observe(grid, { 
        childList: true, 
        subtree: true,
        attributes: true,
        characterData: true 
      });
    }
  };
  
  // Tentar a cada 500ms até encontrar o grid
  const checkInterval = setInterval(() => {
    if (document.querySelector('#grid')) {
      clearInterval(checkInterval);
      startObserving();
    }
  }, 500);
  
  // Também interceptar o botão de enviar WhatsApp
  document.addEventListener('click', (e) => {
    if (e.target.id === 'sendWA' || e.target.closest('#sendWA')) {
      const equipData = collectRdoMultiData();
      equipData.contexto = {
        data: document.querySelector('#data')?.value,
        turno: document.querySelector('#turno')?.value,
        escala: document.querySelector('#escala')?.value,
        operador: document.querySelector('#operador')?.value,
        equipe: document.querySelector('#equipe')?.value
      };
      window.rdoSync.finalizeRdo(window.rdoSync.currentRdoId, equipData);
    }
  });
}

// Se estiver no Comparador
if (currentPage.includes('Comparador') || document.querySelector('#txtOperadores')) {
  console.log('🟠 Modo Comparador detectado - Ativando recepção em tempo real');
  
  // Escutar dados do RDO-Multi
  window.rdoSync.listenToActiveRdos((data, id) => {
    console.log('📥 Dados recebidos do RDO-Multi:', data);
    
    // Converter formato do RDO-Multi para formato do Comparador
    const textoFormatado = convertRdoMultiToComparador(data);
    
    // Inserir automaticamente no textarea
    const txtOperadores = document.querySelector('#txtOperadores');
    if (txtOperadores) {
      txtOperadores.value = textoFormatado;
      
      // Disparar evento de input para ativar processamento automático
      txtOperadores.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Tentar processar automaticamente se a função existir
      if (typeof processOperadoresCompleto === 'function') {
        // Pequeno delay para garantir que o DOM está pronto
        setTimeout(() => {
          processOperadoresCompleto();
        }, 100);
      }
    }
    
    // Mostrar notificação visual
    showSyncNotification(data);
  });
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function collectRdoMultiData() {
  const equipamentos = [];
  
  // Tentar acessar a variável global EQUIPS
  if (window.EQUIPS && Array.isArray(window.EQUIPS)) {
    window.EQUIPS.forEach(eq => {
      equipamentos.push({
        codigo: eq.codigo,
        sistema: eq.sistema,
        alias: eq.alias,
        status: eq.status,
        obs: eq.obs,
        probsSel: eq.probsSel,
        photos: (eq.photos || []).length
      });
    });
  }
  
  return {
    equipamentos,
    contexto: {
      data: document.querySelector('#data')?.value,
      turno: document.querySelector('#turno')?.value,
      escala: document.querySelector('#escala')?.value,
      operador: document.querySelector('#operador')?.value,
      equipe: document.querySelector('#equipe')?.value
    },
    timestamp: Date.now()
  };
}

function convertRdoMultiToComparador(data) {
  if (!data.equipamentos || data.equipamentos.length === 0) return '';
  
  let texto = `🧭 RDO-OPERAÇÃO SISTEMA DE CORREIAS\n`;
  texto += `├─ Data: ${data.contexto?.data || new Date().toISOString().split('T')[0]}\n`;
  texto += `├─ Turno: ${data.contexto?.turno || '-'}\n`;
  texto += `├─ Escala: ${data.contexto?.escala || '-'}\n`;
  texto += `├─ Operador: ${data.contexto?.operador || '-'}\n`;
  texto += `└─ Equipe: ${data.contexto?.equipe || '-'}\n\n`;
  
  data.equipamentos.forEach(eq => {
    texto += `├─ 🎯 ${eq.codigo} — ${eq.alias || '-'}\n`;
    texto += `│  ├─ Sistema: ${eq.sistema}\n`;
    
    // Críticos
    texto += `│  ├─ 🔴 Críticos\n`;
    ['C1','C2','C3','C4','C5'].forEach(k => {
      const label = {
        C1: 'Roletes/tambores',
        C2: 'Alinhamento',
        C3: 'Emendas/Cobertura',
        C4: 'Raspadores',
        C5: 'Vedação de chutes'
      }[k];
      texto += `│  │  - ${label}: ${eq.status?.[k] || '_'}\n`;
    });
    
    // Preventivos
    texto += `│  ├─ 🟠 Preventivos\n`;
    ['P1','P2','P3','P4','P5'].forEach(k => {
      const label = {
        P1: 'Lubrificação',
        P2: 'Motor (A/Temp)',
        P3: 'Raspadores secundários',
        P4: 'Retorno limpo',
        P5: 'Roletes de impacto'
      }[k];
      texto += `│  │  - ${label}: ${eq.status?.[k] || '_'}\n`;
    });
    
    // Melhoria
    texto += `│  ├─ 🟢 Melhoria\n`;
    ['M1','M2','M3','M4'].forEach(k => {
      const label = {
        M1: 'Treinamento',
        M2: 'Registro de falhas',
        M3: 'Sensores',
        M4: 'Ambiental'
      }[k];
      texto += `│  │  - ${label}: ${eq.status?.[k] || '_'}\n`;
    });
    
    // Problemas selecionados
    if (eq.probsSel && eq.probsSel.length > 0) {
      texto += `├─ ⚠️ Problemas selecionados: ${eq.probsSel.join(', ')}\n`;
    }
    
    // Observações
    if (eq.obs) {
      texto += `└─ 📝 ${eq.obs}\n`;
    }
    
    texto += `\n`;
  });
  
  return texto;
}

function showSyncNotification(data) {
  // Remover notificação anterior se existir
  const existing = document.querySelector('#sync-notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.id = 'sync-notification';
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #005c8f, #3a9d5d);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    animation: slideIn 0.3s ease;
    max-width: 400px;
  `;
  
  const equipCount = data.equipamentos?.length || 0;
  const operador = data.contexto?.operador || 'Operador';
  
  notif.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="font-size:24px;">⚡</div>
      <div>
        <div style="font-weight:700;font-size:14px;">RDO Recebido em Tempo Real!</div>
        <div style="font-size:12px;opacity:0.9;margin-top:4px;">
          ${operador} • ${equipCount} equipamento(s) • Processando...
        </div>
      </div>
    </div>
  `;
  
  // Adicionar animação
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notif);
  
  // Auto-remover após 5 segundos
  setTimeout(() => {
    notif.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notif.remove(), 300);
  }, 5000);
}

console.log('✅ RDO Sync System carregado');
</script>