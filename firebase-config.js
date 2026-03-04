// ============================================
// FIREBASE CONFIG - VERSÃO CORRETA (Compatível)
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDEotosWG9ss-pMDbZluy5Dg_bOfG8kHJQ",
  authDomain: "rdo-sync.firebaseapp.com",
  projectId: "rdo-sync",
  storageBucket: "rdo-sync.firebasestorage.app",
  messagingSenderId: "551344630048",
  appId: "1:551344630048:web:87e485e712473a46234f45"
};

// Inicializar Firebase (versão compatível)
firebase.initializeApp(firebaseConfig);

// Inicializar Firestore
const db = firebase.firestore();

// Configurar Firestore
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true
});

console.log('✅ Firebase inicializado com sucesso!');
console.log('📁 Projeto:', firebaseConfig.projectId);
