// ============================================
// FIREBASE CONFIG — CORRIGIDO (compat)
// - Remove "merge" inválido em db.settings (pode quebrar inicialização)
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDEotosWG9ss-pMDbZluy5BDg_bOfG8kHJQ",
  authDomain: "rdo-sync.firebaseapp.com",
  projectId: "rdo-sync",
  storageBucket: "rdo-sync.firebasestorage.app",
  messagingSenderId: "551344630048",
  appId: "1:551344630048:web:87e485e712473a46234f45"
};

// Evitar dupla inicialização
if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
} else if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
  // ok
} else {
  console.warn('Firebase SDK não carregou ainda. Carregue firebase-app-compat.js antes deste arquivo.');
}

const db = firebase.firestore();

// settings: apenas chaves suportadas
try {
  db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    // ignoreUndefinedProperties: true, // opcional (se precisar)
  });
} catch (e) {
  console.warn('Firestore settings warning:', e);
}

console.log('✅ Firebase inicializado:', firebaseConfig.projectId);
