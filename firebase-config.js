// ============================================
// FIREBASE CONFIG — VERSÃO CORRETA E OTIMIZADA
// ============================================

// Sua configuração do Firebase (a que está no console do Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyDEotosWG9ss-pMDbZluy5Dg_bOfG8kHJQ",
  authDomain: "rdo-sync.firebaseapp.com",
  projectId: "rdo-sync",
  storageBucket: "rdo-sync.firebasestorage.app", // Confirme se é .app ou .com
  messagingSenderId: "551344630048",
  appId: "1:551344630048:web:87e485e712473a46234f45"
};

// Inicializar o Firebase APENAS se ele ainda não foi inicializado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Se já inicializado, usa a instância existente
}

// Disponibilizar o Firestore globalmente
const db = firebase.firestore();

// Configurações do Firestore (opcional, mas útil)
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
  // ignoreUndefinedProperties: true // Descomente se precisar ignorar campos undefined
});

console.log(`🔥 Firebase inicializado com sucesso: ${firebaseConfig.projectId}`);
