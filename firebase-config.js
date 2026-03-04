// CONFIGURAÇÃO DO FIREBASE (SUBSTITUA PELOS SEUS DADOS)
const firebaseConfig = {
  apiKey: "AIzaSyDEotosWG9ss-pMDbZluy5Dg_bOfG8kHJQ",
  authDomain: "rdo-sync.firebaseapp.com",
  projectId: "rdo-sync",
  storageBucket: "rdo-sync.firebasestorage.app",
  messagingSenderId: "551344630048",
  appId: "1:551344630048:web:87e485e712473a46234f45"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Configurações do Firestore
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true
});

// Coleção para os dados dos operadores
const RDO_COLLECTION = 'rdo_operadores';